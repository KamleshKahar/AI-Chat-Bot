import { prisma, toUtcDate, todayDateOnly, addDays, yearOf } from '../config/prisma.js';
import { AppError } from '../errors/AppError.js';
import { auditRepo } from '../repositories/audit.repo.js';
import { customerRepo } from '../repositories/customer.repo.js';
import { invoiceRepo } from '../repositories/invoice.repo.js';
import { paymentRepo } from '../repositories/payment.repo.js';
import { productRepo } from '../repositories/product.repo.js';
import { SEQ, invoiceSequence, nextCode } from '../lib/codes.js';
import { computeBalanceDue, computeInvoiceTotals, resolvePaymentStatusEnum } from '../lib/billing.js';
import { resolveTaxType } from '../lib/gst.js';
import { d, money } from '../lib/decimal.js';
import { toPaymentMethodEnum } from '../lib/enums.js';
import {
  attachProductCodes,
  serializeInvoice,
  serializeSale,
} from '../serializers/index.js';

const DEFAULT_TERMS =
  '1. Payment is due within 15 days of the invoice date.\n' +
  '2. Interest @ 18% p.a. will be charged on overdue payments.\n' +
  '3. Goods once sold will not be returned unless a manufacturing defect is notified within 48 hours.';

/**
 * Sales service.
 *
 * `createSale` is the only place in the system where stock, money and three
 * different ledgers move at once, so it runs as a single database transaction:
 *
 *   lock products -> verify stock -> compute totals (authoritatively)
 *   -> allocate codes -> write invoice + items -> decrement stock
 *   -> write stock movements -> write payment -> write cash ledger -> audit
 *
 * Any failure rolls the whole thing back; there is no partial sale.
 */
export const saleService = {
  /**
   * @param {object} payload validated by schemas/validators.js#createSaleSchema
   * @param {{id:number}} actor authenticated user
   */
  async createSale(payload, actor, { ip } = {}) {
    const paymentMethod = toPaymentMethodEnum(payload.paymentMethod) ?? 'UPI';
    const invoiceDate = payload.date ?? todayDateOnly();

    return prisma.$transaction(async (tx) => {
      // ---- 1. customer -----------------------------------------------------
      const customer = await customerRepo.resolve(payload.customerId, tx);
      if (!customer) {
        throw AppError.validation('Please select a customer', {
          customerId: `No customer matches "${payload.customerId}"`,
        });
      }

      // ---- 2. resolve + row-lock products, in ascending id order ------------
      // Ascending id order prevents two concurrent sales touching overlapping
      // product sets from deadlocking on each other's row locks.
      //
      // The lock is taken *first* and every value below is read from the locked
      // row. Reading before locking would leave a window in which another
      // transaction could commit a deduction and this one would still see the
      // stale (higher) stock level — which is precisely how two sales oversell.
      const wanted = [...payload.items].sort(
        (a, b) => String(a.productId).localeCompare(String(b.productId), undefined, { numeric: true })
      );

      const resolved = [];
      for (const item of wanted) {
        const found = await tx.product.findFirst({
          where: { OR: [{ code: item.productId }, { sku: item.productId }], deletedAt: null },
        });
        if (!found) {
          throw AppError.validation('Unknown product', {
            [`items.${item.productId}`]: `No product matches "${item.productId}"`,
          });
        }

        const product = await productRepo.lockById(found.id, tx);
        if (!product) {
          throw AppError.conflict(`Product ${found.code} is locked by another operation`);
        }
        resolved.push({
          product,
          quantity: Number(item.quantity),
          requestedPrice: item.unitPrice,
        });
      }

      // ---- 3. stock availability (checked against the locked quantities) ----
      const shortages = resolved
        .filter((r) => r.quantity > r.product.stockQuantity)
        .map((r) => ({
          productId: r.product.code,
          requested: r.quantity,
          available: r.product.stockQuantity,
        }));

      if (shortages.length > 0) {
        throw AppError.conflict(
          `Insufficient stock for ${shortages.length} product(s)`,
          { details: { shortages: shortages.map((s) => `${s.productId}: requested ${s.requested}, only ${s.available} in stock`) } }
        );
      }

      // ---- 4. authoritative totals ----------------------------------------
      // `unitPrice` falls back to the catalogue selling price; a client-supplied
      // price is honoured so negotiated rates still work, but every *total* is
      // recomputed here and the client's own totals are discarded entirely.
      const lineInput = resolved.map((r) => ({
        productId: r.product.code,
        quantity: r.quantity,
        unitPrice: r.requestedPrice ?? r.product.sellingPrice,
      }));

      const taxType = resolveTaxType(
        // Read through the transaction so the company profile is part of the
        // same consistent snapshot as the customer it is compared against.
        { state: (await tx.companyProfile.findFirst({ select: { state: true } }))?.state },
        { state: customer.state }
      );

      const totals = computeInvoiceTotals({
        items: lineInput,
        discountType: payload.discountType,
        discountValue: payload.discountValue,
        taxRate: payload.taxRate,
        shippingCharges: payload.shippingCharges,
        taxType,
        resolvedProducts: resolved.map((r) => r.product),
      });

      // ---- 5. payment ------------------------------------------------------
      let paidAmount = money(0);
      if (payload.paymentMode === 'full') paidAmount = totals.grandTotal;
      else if (payload.paymentMode === 'partial') paidAmount = money(payload.paymentAmount);

      if (paidAmount.greaterThan(totals.grandTotal)) {
        throw AppError.validation(
          'Payment cannot exceed the invoice total',
          { paymentAmount: `Maximum payable is ${totals.grandTotal.toFixed(2)}` }
        );
      }

      const balanceDue = computeBalanceDue(totals.grandTotal, paidAmount);
      const paymentStatus = resolvePaymentStatusEnum(totals.grandTotal, paidAmount);

      // ---- 6. document numbers --------------------------------------------
      const invoiceNumber = await nextCode(tx, invoiceSequence(yearOf(invoiceDate)));
      const saleCode = await nextCode(tx, SEQ.SALE);

      // ---- 7. invoice + items ---------------------------------------------
      const invoice = await tx.invoice.create({
        data: {
          invoiceNumber,
          saleCode,
          customerId: customer.id,
          invoiceDate: toUtcDate(invoiceDate),
          dueDate: toUtcDate(addDays(invoiceDate, 15)),

          subtotal: totals.subtotal,
          discountType: totals.discountType,
          discountValue: totals.discountValue,
          discountPercent: totals.discountPercent,
          discountAmount: totals.discountAmount,
          taxableAmount: totals.taxableAmount,
          taxType: totals.taxType,
          taxRate: totals.taxRate,
          cgstAmount: totals.cgstAmount,
          sgstAmount: totals.sgstAmount,
          igstAmount: totals.igstAmount,
          taxAmount: totals.taxAmount,
          shippingCharges: totals.shippingCharges,
          grandTotal: totals.grandTotal,
          paidAmount,
          balanceDue,
          paymentStatus,
          paymentMethod,
          status: 'CONFIRMED',
          notes: payload.notes ?? null,
          terms: DEFAULT_TERMS,

          snapshotName: customer.name,
          snapshotCompany: customer.company,
          snapshotEmail: customer.email,
          snapshotPhone: customer.phone,
          snapshotAddress: customer.address,
          snapshotCity: customer.city,
          snapshotState: customer.state,
          snapshotPincode: customer.pincode,
          snapshotGstin: customer.gstin,

          createdById: actor?.id ?? null,

          items: {
            create: totals.lines.map((line) => ({
              productId: line.productId ?? null,
              productName: line.productName,
              sku: line.sku,
              unit: line.unit,
              hsnCode: line.hsnCode,
              quantity: line.quantity,
              unitPrice: line.unitPrice,
              discountAmount: line.discountAmount,
              taxableValue: line.taxableValue,
              taxRate: totals.taxRate,
              cgstAmount: line.cgstAmount,
              sgstAmount: line.sgstAmount,
              igstAmount: line.igstAmount,
              lineTotal: line.lineTotal,
              sortOrder: line.sortOrder,
            })),
          },
        },
        // A nested `create` does not return the children, so without this the
        // response projection would serialise an empty `items` array and the
        // client would never see the lines it just created.
        include: { items: { orderBy: { sortOrder: 'asc' } } },
      });

      // ---- 8. stock out + movement ledger ---------------------------------
      const movements = [];
      for (let i = 0; i < resolved.length; i += 1) {
        const { product, quantity } = resolved[i];
        const after = product.stockQuantity - quantity;

        await tx.product.update({
          where: { id: product.id },
          data: { stockQuantity: { decrement: quantity } },
        });

        movements.push({
          productId: product.id,
          type: 'SALE',
          quantityDelta: -quantity,
          stockAfter: after,
          unitCost: product.costPrice,
          referenceType: 'INVOICE',
          referenceId: invoiceNumber,
          reason: `Sale ${invoiceNumber}`,
          createdById: actor?.id ?? null,
        });
      }
      await tx.stockMovement.createMany({ data: movements });

      // ---- 9. payment + cash ledger ---------------------------------------
      if (paidAmount.greaterThan(0)) {
        await nextCode(tx, SEQ.PAYMENT).then((paymentCode) =>
          tx.payment.create({
            data: {
              paymentCode,
              invoiceId: invoice.id,
              customerId: customer.id,
              amount: paidAmount,
              paymentMethod,
              paidAt: new Date(),
              notes: 'Payment received at point of sale',
              createdById: actor?.id ?? null,
            },
          })
        );

        const ledgerCode = await nextCode(tx, SEQ.LEDGER);
        await tx.ledgerEntry.create({
          data: {
            entryCode: ledgerCode,
            entryDate: toUtcDate(invoiceDate),
            direction: 'IN',
            type: 'SALE_PAYMENT',
            amount: paidAmount,
            paymentMethod,
            reference: invoiceNumber,
            customerId: customer.id,
            invoiceId: invoice.id,
            status: 'SUCCESS',
            isSettlement: false,
            notes: payload.notes ?? null,
          },
        });
      }

      // ---- 10. audit -------------------------------------------------------
      await auditRepo.write(
        {
          actorUserId: actor?.id ?? null,
          action: 'CREATE',
          entityType: 'invoice',
          entityId: invoiceNumber,
          after: {
            grandTotal: totals.grandTotal.toFixed(2),
            paidAmount: paidAmount.toFixed(2),
            paymentStatus,
            taxType: totals.taxType,
            lines: totals.lines.length,
          },
          ip,
        },
        tx
      );

      // ---- 11. response ----------------------------------------------------
      const withCodes = await attachProductCodes(invoice, tx);
      return {
        sale: serializeSale({ ...withCodes, customer_code: customer.code }),
        invoice: serializeInvoice(withCodes),
      };
    });
  },

  /** Paginated POS-oriented list. */
  async list(query) {
    const { rows, total } = await invoiceRepo.list(query);
    return { rows: rows.map(serializeSale), total };
  },

  async get(idOrCode) {
    const invoice = await invoiceRepo.resolve(idOrCode);
    if (!invoice) throw AppError.notFound('Sale not found');
    const withCodes = await attachProductCodes(invoice);
    return serializeSale(withCodes);
  },
};

export default saleService;