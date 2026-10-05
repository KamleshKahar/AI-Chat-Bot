import { prisma } from '../config/prisma.js';

export const paymentRepo = {
  create(data, db = prisma) {
    return db.payment.create({ data });
  },

  listForInvoice(invoiceId, db = prisma) {
    return db.payment.findMany({
      where: { invoiceId: Number(invoiceId) },
      orderBy: { paidAt: 'asc' },
    });
  },

  listForCustomer(customerId, { limit = 50 } = {}, db = prisma) {
    return db.payment.findMany({
      where: { customerId: Number(customerId) },
      orderBy: { paidAt: 'desc' },
      take: Number(limit),
    });
  },

  /** Total received against an invoice, straight from the payments ledger. */
  async totalForInvoice(invoiceId, db = prisma) {
    const [row] = await db.$queryRaw`
      SELECT COALESCE(SUM(amount), 0) AS total FROM payments WHERE invoice_id = ${Number(invoiceId)}
    `;
    return row?.total ?? 0;
  },
};

export default paymentRepo;