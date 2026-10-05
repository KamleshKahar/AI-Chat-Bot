import { prisma, withTransaction } from '../config/prisma.js';
import { SEQ, nextCode } from '../lib/codes.js';
import { AppError } from '../errors/AppError.js';

/**
 * Match either the human code ('CAT-01') or the numeric surrogate key.
 * `Number('CAT-01')` is NaN, so a non-numeric segment must never be coerced
 * straight into an `id` filter.
 */
function codeOrPk(idOrCode) {
  const asNumber = Number(idOrCode);
  const numeric = Number.isInteger(asNumber) && asNumber > 0 ? asNumber : -1;
  return { OR: [{ code: String(idOrCode) }, { id: numeric }] };
}

/**
 * Categories. The set is small and always needed in full by the frontend's
 * filter dropdowns, so this endpoint returns the complete active list — bounded
 * by nature, not by omission of pagination.
 */
export const categoryRepo = {
  listAll(db = prisma) {
    return db.category.findMany({
      where: { deletedAt: null },
      orderBy: [{ code: 'asc' }],
    });
  },

  listActive(db = prisma) {
    return db.category.findMany({
      where: { deletedAt: null, isActive: true },
      orderBy: [{ code: 'asc' }],
    });
  },

  findByCode(code, db = prisma) {
    return db.category.findFirst({ where: { code, deletedAt: null } });
  },

  /**
   * Resolve a `:id` path segment, which is the human code (`CAT-01`) in practice.
   * `Number('CAT-01')` is NaN, so falling back to a bare `id: Number(...)` makes
   * every code-addressed category lookup fail.
   */
  findById(idOrCode, db = prisma) {
    return db.category.findFirst({
      where: { ...codeOrPk(idOrCode), deletedAt: null },
    });
  },

  async update(idOrCode, data, db = prisma) {
    const category = await this.findById(idOrCode, db);
    if (!category) throw AppError.notFound('Category not found');
    return db.category.update({ where: { id: category.id }, data });
  },

  async create(data, db = prisma) {
    const existing = await db.category.findFirst({
      where: { OR: [{ name: data.name }, { code: data.code }], deletedAt: null },
    });
    if (existing) {
      throw AppError.conflict(
        existing.name === data.name
          ? `A category named "${data.name}" already exists`
          : `Category code "${data.code}" is already in use`,
        { details: { [existing.name === data.name ? 'name' : 'code']: 'Must be unique' } }
      );
    }

    // The code allocation (SELECT ... FOR UPDATE) must be in the same
    // transaction as the insert, or two concurrent creates could take the same
    // number.
    return withTransaction(db, async (tx) => {
      const code = data.code || (await nextCode(tx, SEQ.CATEGORY));
      return tx.category.create({ data: { ...data, code } });
    });
  },

  /** Rejects with 409 while any product still references the category. */
  async softDelete(idOrCode, db = prisma) {
    const category = await this.findById(idOrCode, db);
    if (!category) throw AppError.notFound('Category not found');

    const productCount = await db.product.count({
      where: { categoryId: category.id, deletedAt: null },
    });
    if (productCount > 0) {
      throw AppError.conflict(
        `Cannot delete "${category.name}" — ${productCount} product(s) still use it. Reassign them first.`,
        { details: { products: `${productCount} product(s) still use this category` } }
      );
    }

    return db.category.update({
      where: { id: category.id },
      data: { deletedAt: new Date(), isActive: false },
    });
  },

  /** Live products attached to a category, addressed by code or id. */
  async productCount(idOrCode, db = prisma) {
    const category = await this.findById(idOrCode, db);
    if (!category) return 0;
    return db.product.count({ where: { categoryId: category.id, deletedAt: null } });
  },
};

export default categoryRepo;