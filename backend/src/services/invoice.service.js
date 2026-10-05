import { prisma, toUtcDate, todayDateOnly } from '../config/prisma.js';
import { AppError } from '../errors/AppError.js';
import { auditRepo } from '../repositories/audit.repo.js';
import { invoiceRepo } from '../repositories/invoice.repo.js';
import { paymentRepo } from '../repositories/payment.repo.js';
import { SEQ, nextCode } from '../lib/codes.js';
import { computeBalanceDue, resolvePaymentStatusEnum } from '../lib/billing.js';
import { d, money } from '../lib/decimal.js';
import { toPaymentMethodEnum } from '../lib/enums.js';
import {
  attachProductCodes,
  serializeInvoice,
  serializePayment,
  serializeSale,
} from '../serializers/index.js';

export const invoiceService = {
  async list(query) {
    const { rows, total } = await invoiceRepo.list(query);
    return { rows: rows.map(serializeInvoice), total };
  },

  /** Counts for the invoice filter chips, including derived Overdue. */
  async statusCounts() {
    return invoiceRepo.paymentStatusCounts();
  },

  async get(idOrCode) {
    const invoice = await invoiceRepo.resolve(idOrCode);
    if (!invoice) throw AppError.notFound('Invoice not found');

    const withCodes = await attachProductCodes(invoice);
    return {
      ...serializeInvoice(withCodes),
      payments: (invoice.payments ?? []).map(serializePayment),
    };
  },

  /**
   * Record a payment against an invoice.
   *
   * The invoice row is locked for the duration of the transaction so two
   * concurrent payments cannot both read the same `balance_due` and together
   * overpay. `payment_status` is recomputed from the money rather than trusted.
   */
  async recordPayment(idOrCode, { amount, paymentMethod, reference, notes }, actor, { ip } = {}) {
    const existing = await invoiceRepo.resolve(idOrCode);
    if (!existing) throw AppError.notFound('Invoice not found');

    const method = toPaymentMethodEnum(paymentMethod) ?? existing.paymentMethod ?? 'UPI';
    const payAmount = money(amount);

    return prisma.$transaction(async (tx) => {
      // Lock the invoice.
      const rows = await tx.$queryRawUnsafe(
        'SELECT id, grand_total, paid_amount, balance_due, invoice_number, customer_id FROM invoices WHERE id = ? FOR UPDATE',
        existing.id
      );
      if (!rows.length) throw AppError.notFound('Invoice not found');

      const grandTotal = money(rows[0].grand_total);
      const paidAmount = money(rows[0].paid_amount);
      const balanceDue = computeBalanceDue(grandTotal, paidAmount);

      if (payAmount.greaterThan(balanceDue)) {
        throw AppError.validation('Payment exceeds the outstanding balance', {
          amount: `Maximum payable is ${balanceDue.toFixed(2)}`,
        });
      }

      const newPaid = money(paidAmount.plus(payAmount));
      const newBalance = computeBalanceDue(grandTotal, newPaid);
      const paymentStatus = resolvePaymentStatusEnum(grandTotal, newPaid);

      const paymentCode = await nextCode(tx, SEQ.PAYMENT);
      await paymentRepo.create(
        {
          paymentCode,
          invoiceId: existing.id,
          customerId: existing.customerId,
          amount: payAmount,
          paymentMethod: method,
          reference: reference ?? null,
          paidAt: new Date(),
          notes: notes ?? null,
          createdById: actor?.id ?? null,
        },
        tx
      );

      await tx.invoice.update({
        where: { id: existing.id },
        data: { paidAmount: newPaid, balanceDue: newBalance, paymentStatus },
      });

      const entryCode = await nextCode(tx, SEQ.LEDGER);
      await tx.ledgerEntry.create({
        data: {
          entryCode,
          entryDate: toUtcDate(todayDateOnly()),
          direction: 'IN',
          type: 'SALE_PAYMENT',
          amount: payAmount,
          paymentMethod: method,
          reference: reference ?? existing.invoiceNumber,
          customerId: existing.customerId,
          invoiceId: existing.id,
          status: 'SUCCESS',
          // Money arriving against a previously raised invoice.
          isSettlement: true,
          notes: notes ?? `Payment against ${existing.invoiceNumber}`,
        },
      });

      await auditRepo.write(
        {
          actorUserId: actor?.id ?? null,
          action: 'RECORD_PAYMENT',
          entityType: 'invoice',
          entityId: existing.invoiceNumber,
          before: { paidAmount: paidAmount.toFixed(2), paymentStatus: existing.paymentStatus },
          after: {
            paidAmount: newPaid.toFixed(2),
            balanceDue: newBalance.toFixed(2),
            paymentStatus,
            method,
          },
          ip,
        },
        tx
      );

      const updated = await invoiceRepo.resolve(existing.invoiceNumber, tx);
      const withCodes = await attachProductCodes(updated, tx);
      return {
        ...serializeInvoice(withCodes),
        payments: (updated.payments ?? []).map(serializePayment),
      };
    });
  },

  async remove(idOrCode, actor, { ip } = {}) {
    const row = await invoiceRepo.softDelete(idOrCode);
    await auditRepo.write({
      actorUserId: actor?.id ?? null,
      action: 'CANCEL',
      entityType: 'invoice',
      entityId: row.invoiceNumber,
      ip,
    });
    return { id: row.invoiceNumber, deleted: true };
  },

  /** Convenience: the sale projection for one invoice. */
  async asSale(idOrCode) {
    const invoice = await invoiceRepo.resolve(idOrCode);
    if (!invoice) throw AppError.notFound('Invoice not found');
    const withCodes = await attachProductCodes(invoice);
    return serializeSale(withCodes);
  },
};

export default invoiceService;