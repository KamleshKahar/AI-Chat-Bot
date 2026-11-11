import { prisma, toUtcDate, todayDateOnly, yearOf } from '../config/prisma.js';
import { AppError } from '../errors/AppError.js';
import { auditRepo } from '../repositories/audit.repo.js';
import { creditNoteRepo } from '../repositories/creditNote.repo.js';
import { invoiceRepo } from '../repositories/invoice.repo.js';
import { productRepo } from '../repositories/product.repo.js';
import { SEQ, creditNoteSequence, nextCode } from '../lib/codes.js';
import { computeCreditNoteTotals, resolveSettlementState } from '../lib/billing.js';
import { money } from '../lib/decimal.js';
import { attachProductCodes, serializeCreditNote } from '../serializers/index.js';

/**
 * Credit-note service.
 *
 * Like `saleService.createSale`, issuing a note moves stock, money-marks and
 * two ledgers at once, so everything happens inside one transaction:
 *
 *   lock invoice -> read its lines -> enforce quantity caps
 *   -> compute totals authoritatively (lib/billing.js)
 *   -> allocate CRN code -> write note + items -> restock (RETURN movements)
 *   -> write refund ledger entry -> update invoice credit + balance -> audit
 *
 * The payload only ever chooses *which lines and how many units* — prices,
 * slabs, discounts and tax all come from the stored invoice, so a client
 * cannot price a credit note at all.
 */
export const creditNoteService = {
  async list(query) {
    const { rows, total } = await creditNoteRepo.list(query);
    return { rows: rows.map(serializeCreditNote), total };
  },

  async get(idOrCode) {
    const note = await creditNoteRepo.resolve(idOrCode);
    if (!note) throw AppError.notFound('Credit note not found');
    const withCodes = await attachProductCodes(note);
    return serializeCreditNote({
      ...withCodes,
      invoice_number: note.invoice?.invoiceNumber ?? null,
      customer_code: note.customer?.code ?? null,
    });
  },

  /**
   * Issue a credit note against an invoice.
   *
   * @param {string} invoiceIdOrCode INV-2026-001 or numeric PK
   * @param {object} payload validated by createCreditNoteSchema
   * @param {{id:number}} actor authenticated user
   */
  async create(invoiceIdOrCode, payload, actor, { ip } = {}) {
    const creditDate = payload.date ?? todayDateOnly();

    // Resolve outside the transaction purely to get the id; everything the
    // maths touches is re-read after the row lock is held.
    const existing = await invoiceRepo.resolve(invoiceIdOrCode);
    if (!existing) throw AppError.notFound('Invoice not found');

    return prisma.$transaction(async (tx) => {
      // ---- 1. lock the invoice ------------------------------------------
      const rows = await tx.$queryRawUnsafe(
        `SELECT id, invoice_number, customer_id, grand_total, paid_amount, credited_amount,
                tax_type, tax_rate, snapshot_name, snapshot_company, snapshot_gstin, snapshot_state
         FROM invoices WHERE id = ? AND deleted_at IS NULL FOR UPDATE`,
        existing.id
      );
      if (!rows.length) throw AppError.notFound('Invoice not found');
      const head = rows[0];

      const invoiceItems = await tx.invoiceItem.findMany({
        where: { invoiceId: head.id },
        orderBy: { sortOrder: 'asc' },
      });
      const byId = new Map(invoiceItems.map((item) => [item.id, item]));
      const creditedBefore = await creditNoteRepo.creditedQuantities(head.id, tx);

      // ---- 2. validate the credited lines against the caps ---------------
      const seen = new Set();
      const engineInput = [];

      for (const [index, line] of payload.items.entries()) {
        if (seen.has(line.invoiceItemId)) {
          throw AppError.validation('The same invoice line appears twice', {
            [`items.${index}.invoiceItemId`]: 'Line already selected',
          });
        }
        seen.add(line.invoiceItemId);

        const item = byId.get(line.invoiceItemId);
        if (!item) {
          throw AppError.validation('That line is not part of this invoice', {
            [`items.${index}.invoiceItemId`]: `No line ${line.invoiceItemId} on ${head.invoice_number}`,
          });
        }

        const alreadyCredited = creditedBefore.get(item.id) ?? 0;
        const available = Number(item.quantity) - alreadyCredited;
        if (line.quantity > available) {
          throw AppError.validation('Credited quantity exceeds what is still returnable', {
            [`items.${index}.quantity`]:
              available <= 0
                ? 'This line has already been fully credited'
                : `Only ${available} unit(s) of "${item.productName}" remain returnable`,
          });
        }

        engineInput.push({
          invoiceItemId: item.id,
          productId: item.productId,
          productName: item.productName,
          sku: item.sku,
          unit: item.unit,
          hsnCode: item.hsnCode,
          invoicedQuantity: item.quantity,
          creditedQuantity: line.quantity,
          unitPrice: item.unitPrice,
          lineDiscountAmount: item.discountAmount,
          taxRate: item.taxRate,
        });
      }

      // ---- 3. authoritative totals ---------------------------------------
      const totals = computeCreditNoteTotals({
        items: engineInput,
        taxType: head.tax_type,
      });

      // Defence in depth: the per-line caps imply this, but never let a note
      // push an invoice's credits past its own total.
      const priorCredited = money(head.credited_amount ?? 0);
      const grandTotal = money(head.grand_total);
      if (money(priorCredited.plus(totals.grandTotal)).greaterThan(grandTotal)) {
        throw AppError.conflict('Credit would exceed the invoice total', {
          details: { invoice: `${head.invoice_number} is already credited up to its total` },
        });
      }

      // ---- 4. document number + the note itself --------------------------
      const creditNoteNumber = await nextCode(tx, creditNoteSequence(yearOf(creditDate)));

      const note = await tx.creditNote.create({
        data: {
          creditNoteNumber,
          invoiceId: head.id,
          customerId: head.customer_id,
          creditDate: toUtcDate(creditDate),
          reason: payload.reason ?? null,

          subtotal: totals.subtotal,
          discountAmount: totals.discountAmount,
          taxableAmount: totals.taxableAmount,
          taxType: totals.taxType,
          taxRate: head.tax_rate,
          cgstAmount: totals.cgstAmount,
          sgstAmount: totals.sgstAmount,
          igstAmount: totals.igstAmount,
          taxAmount: totals.taxAmount,
          grandTotal: totals.grandTotal,

          snapshotName: head.snapshot_name,
          snapshotCompany: head.snapshot_company,
          snapshotGstin: head.snapshot_gstin,
          snapshotState: head.snapshot_state,

          createdById: actor?.id ?? null,

          items: {
            create: totals.lines.map((line) => ({
              invoiceItemId: line.invoiceItemId,
              productId: line.productId ?? null,
              productName: line.productName,
              sku: line.sku,
              unit: line.unit,
              hsnCode: line.hsnCode,
              quantity: line.quantity,
              unitPrice: line.unitPrice,
              discountAmount: line.discountAmount,
              taxableValue: line.taxableValue,
              taxRate: line.taxRate,
              cgstAmount: line.cgstAmount,
              sgstAmount: line.sgstAmount,
              igstAmount: line.igstAmount,
              lineTotal: line.lineTotal,
              sortOrder: line.sortOrder,
            })),
          },
        },
        include: { items: { orderBy: { sortOrder: 'asc' } } },
      });

      // ---- 5. restock (RETURN movements) ---------------------------------
      // Products are locked in ascending id order — the same lock ordering
      // saleService uses — so a credit note and a concurrent sale touching the
      // same products serialise instead of deadlocking.
      const restockLines = totals.lines
        .filter((line) => line.productId !== null && line.productId !== undefined)
        .sort((a, b) => Number(a.productId) - Number(b.productId));

      const movements = [];
      for (const line of restockLines) {
        const product = await productRepo.lockById(line.productId, tx);
        if (!product) {
          throw AppError.conflict(`Product ${line.sku} is locked by another operation`);
        }

        const after = product.stockQuantity + line.quantity;
        await tx.product.update({
          where: { id: product.id },
          data: { stockQuantity: { increment: line.quantity } },
        });

        movements.push({
          productId: product.id,
          type: 'RETURN',
          quantityDelta: line.quantity,
          stockAfter: after,
          unitCost: product.costPrice,
          referenceType: 'CREDIT_NOTE',
          referenceId: creditNoteNumber,
          reason: `Credit note ${creditNoteNumber}`,
          createdById: actor?.id ?? null,
        });
      }
      if (movements.length > 0) await tx.stockMovement.createMany({ data: movements });

      // ---- 6. invoice credit + money triad --------------------------------
      const creditedAmount = money(priorCredited.plus(totals.grandTotal));
      const settled = resolveSettlementState({
        grandTotal,
        paidAmount: money(head.paid_amount),
        creditedAmount,
      });

      await tx.invoice.update({
        where: { id: head.id },
        data: {
          creditedAmount,
          balanceDue: settled.balanceDue,
          paymentStatus: settled.paymentStatus,
        },
      });

      // ---- 7. refund ledger entry -----------------------------------------
      // Booked OUT so accountants see the reversal in the cash ledger. It is
      // a document adjustment, not a payment by method — hence no method.
      const entryCode = await nextCode(tx, SEQ.LEDGER);
      await tx.ledgerEntry.create({
        data: {
          entryCode,
          entryDate: toUtcDate(creditDate),
          direction: 'OUT',
          type: 'REFUND',
          amount: totals.grandTotal,
          paymentMethod: null,
          reference: creditNoteNumber,
          customerId: head.customer_id,
          invoiceId: head.id,
          status: 'SUCCESS',
          isSettlement: false,
          notes: payload.reason
            ? `Credit note ${creditNoteNumber} against ${head.invoice_number}: ${payload.reason}`
            : `Credit note ${creditNoteNumber} against ${head.invoice_number}`,
        },
      });

      // ---- 8. audit --------------------------------------------------------
      await auditRepo.write(
        {
          actorUserId: actor?.id ?? null,
          action: 'CREATE',
          entityType: 'credit_note',
          entityId: creditNoteNumber,
          after: {
            invoice: head.invoice_number,
            grandTotal: totals.grandTotal.toFixed(2),
            lines: totals.lines.length,
            taxType: totals.taxType,
          },
          ip,
        },
        tx
      );

      // ---- 9. response -----------------------------------------------------
      const withCodes = await attachProductCodes(note, tx);
      return serializeCreditNote({ ...withCodes, invoice_number: head.invoice_number });
    });
  },

  /**
   * Delete (reverse) a credit note. ADMIN-only at the route layer.
   *
   * Every effect of `create` is unwound: stock goes back down, the refund
   * ledger row is removed, the invoice's credited amount shrinks, and the note
   * is soft-deleted so the audit trail keeps the document itself.
   */
  async remove(idOrCode, actor, { ip } = {}) {
    return prisma.$transaction(async (tx) => {
      const note = await creditNoteRepo.resolve(idOrCode, tx);
      if (!note) throw AppError.notFound('Credit note not found');

      const rows = await tx.$queryRawUnsafe(
        'SELECT id, invoice_number, grand_total, paid_amount, credited_amount FROM invoices WHERE id = ? FOR UPDATE',
        note.invoiceId
      );
      if (!rows.length) throw AppError.notFound('Invoice not found');
      const head = rows[0];

      // ---- 1. take the stock back out ------------------------------------
      const restockLines = note.items
        .filter((line) => line.productId !== null && line.productId !== undefined)
        .sort((a, b) => Number(a.productId) - Number(b.productId));

      const movements = [];
      for (const line of restockLines) {
        const product = await productRepo.lockById(line.productId, tx);
        if (!product) {
          throw AppError.conflict(`Product ${line.sku} is locked by another operation`);
        }
        if (product.stockQuantity < line.quantity) {
          throw AppError.conflict(
            `Cannot delete ${note.creditNoteNumber}: "${product.name}" no longer has the ${line.quantity} unit(s) to take back out`,
            { details: { product: product.code } }
          );
        }

        const after = product.stockQuantity - line.quantity;
        await tx.product.update({
          where: { id: product.id },
          data: { stockQuantity: { decrement: line.quantity } },
        });

        movements.push({
          productId: product.id,
          type: 'ADJUSTMENT_OUT',
          quantityDelta: -line.quantity,
          stockAfter: after,
          unitCost: product.costPrice,
          referenceType: 'CREDIT_NOTE',
          referenceId: note.creditNoteNumber,
          reason: `Deleted ${note.creditNoteNumber}`,
          createdById: actor?.id ?? null,
        });
      }
      if (movements.length > 0) await tx.stockMovement.createMany({ data: movements });

      // ---- 2. remove the refund ledger row --------------------------------
      await tx.ledgerEntry.deleteMany({
        where: { reference: note.creditNoteNumber, type: 'REFUND' },
      });

      // ---- 3. unwind the invoice credit ----------------------------------
      const creditedAmount = money(head.credited_amount ?? 0).minus(
        money(note.grandTotal)
      );
      const settled = resolveSettlementState({
        grandTotal: money(head.grand_total),
        paidAmount: money(head.paid_amount),
        creditedAmount,
      });

      await tx.invoice.update({
        where: { id: note.invoiceId },
        data: {
          creditedAmount,
          balanceDue: settled.balanceDue,
          paymentStatus: settled.paymentStatus,
        },
      });

      // ---- 4. soft-delete + audit -----------------------------------------
      await creditNoteRepo.softDelete(note.creditNoteNumber, tx);
      await auditRepo.write(
        {
          actorUserId: actor?.id ?? null,
          action: 'CANCEL',
          entityType: 'credit_note',
          entityId: note.creditNoteNumber,
          before: { invoice: head.invoice_number, grandTotal: money(note.grandTotal).toFixed(2) },
          ip,
        },
        tx
      );

      return { id: note.creditNoteNumber, deleted: true };
    });
  },
};

export default creditNoteService;
