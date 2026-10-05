import { prisma } from '../config/prisma.js';

/**
 * Stock movements — the audit trail that makes `products.stock_quantity`
 * explainable. Every quantity change (sale, purchase, manual adjustment, damage)
 * writes exactly one row here recording the resulting level, so a stock figure
 * can always be traced back to the documents that produced it.
 */
export const stockRepo = {
  create(data, db = prisma) {
    return db.stockMovement.create({ data });
  },

  createMany(rows, db = prisma) {
    return db.stockMovement.createMany({ data: rows });
  },

  listForProduct(productId, { limit = 50 } = {}, db = prisma) {
    return db.stockMovement.findMany({
      where: { productId: Number(productId) },
      orderBy: { createdAt: 'desc' },
      take: Number(limit),
    });
  },

  /**
   * Reconcile the recorded movements against the live stock figure.
   * A non-zero result means something bypassed the movement ledger, which the
   * seeder uses as a self-check.
   */
  async reconcile(productId, currentStock, db = prisma) {
    const [row] = await db.$queryRaw`
      SELECT COALESCE(SUM(quantity_delta), 0) AS total FROM stock_movements WHERE product_id = ${Number(productId)}
    `;
    return { recorded: Number(row?.total ?? 0), current: Number(currentStock) };
  },
};

export default stockRepo;