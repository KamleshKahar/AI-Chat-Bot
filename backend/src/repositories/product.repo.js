import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma.js';
import { SEQ, nextCode } from '../lib/codes.js';
import { AppError } from '../errors/AppError.js';

/**
 * Products.
 *
 * `status` is derived, never stored:
 *   stock_quantity <= 0             -> out_of_stock
 *   stock_quantity <= min_stock_level -> low_stock
 *   otherwise                        -> in_stock
 *
 * Both filtering and sorting on it happen in SQL (see STATUS_SQL below), not in
 * JavaScript — otherwise "sort by stock ascending" would be applied to a page of
 * rows that had already been chosen by a different rule.
 */
const STATUS_SQL = Prisma.sql`
  CASE
    WHEN p.stock_quantity <= 0 THEN 'out_of_stock'
    WHEN p.stock_quantity <= p.min_stock_level THEN 'low_stock'
    ELSE 'in_stock'
  END
`;

const STATUS_FILTER = {
  out_of_stock: Prisma.sql`p.stock_quantity <= 0`,
  low_stock: Prisma.sql`p.stock_quantity > 0 AND p.stock_quantity <= p.min_stock_level`,
  in_stock: Prisma.sql`p.stock_quantity > p.min_stock_level`,
};

const ORDER_BY = {
  name: (order) => Prisma.sql`p.name ${order}`,
  stock_asc: () => Prisma.sql`p.stock_quantity ASC`,
  stock_desc: () => Prisma.sql`p.stock_quantity DESC`,
  value: (order) => Prisma.sql`(p.stock_quantity * p.cost_price) ${order}`,
  price: (order) => Prisma.sql`p.selling_price ${order}`,
  newest: () => Prisma.sql`p.created_at DESC, p.id DESC`,
};

const PRODUCT_SELECT = Prisma.sql`
  SELECT
    p.id, p.code, p.sku, p.name, p.description, p.unit, p.hsn_code,
    p.mrp, p.selling_price, p.cost_price, p.tax_rate,
    p.stock_quantity, p.min_stock_level, p.is_active,
    p.created_at, p.updated_at,
    c.code AS category_code,
    c.short_code AS category_short_code,
    c.name AS category_name,
    ${STATUS_SQL} AS stock_status,
    (p.stock_quantity * p.cost_price) AS stock_value
  FROM products p
  INNER JOIN categories c ON c.id = p.category_id
`;

function buildWhere({ search, category, status }) {
  const clauses = [Prisma.sql`p.deleted_at IS NULL`];

  if (search) {
    const like = `%${search}%`;
    clauses.push(
      Prisma.sql`(p.name LIKE ${like} OR p.sku LIKE ${like} OR c.name LIKE ${like})`
    );
  }

  if (category) {
    // Accept either the category code (CAT-01) or its display name.
    clauses.push(Prisma.sql`(c.code = ${category} OR c.name = ${category})`);
  }

  if (status && STATUS_FILTER[status]) {
    clauses.push(STATUS_FILTER[status]);
  }

  return Prisma.sql`WHERE ${Prisma.join(clauses, ' AND ')}`;
}

export const productRepo = {
  /** Paginated, filtered, sorted product list. */
  async list({ search, category, status, sort, order, skip, take }, db = prisma) {
    const where = buildWhere({ search, category, status });
    const dir = order === 'desc' ? Prisma.sql`DESC` : Prisma.sql`ASC`;
    const orderBy = (ORDER_BY[sort] ?? ORDER_BY.name)(dir);

    const rows = await db.$queryRaw(
      Prisma.sql`${PRODUCT_SELECT} ${where} ORDER BY ${orderBy}, p.id ${dir} LIMIT ${take} OFFSET ${skip}`
    );

    const [{ total }] = await db.$queryRaw(
      Prisma.sql`SELECT COUNT(*) AS total FROM products p INNER JOIN categories c ON c.id = p.category_id ${where}`
    );

    return { rows, total: Number(total) };
  },

  /** Every active product — used by the seeder and stock reconciliation. */
  listAllActive(db = prisma) {
    return db.product.findMany({
      where: { deletedAt: null },
      include: { category: true },
      orderBy: { code: 'asc' },
    });
  },

  /** Resolve a `:id` path segment, which may be a code (PRD-101) or a numeric PK. */
  async resolve(idOrCode, db = prisma) {
    const asNumber = Number(idOrCode);
    const numeric = Number.isInteger(asNumber) && asNumber > 0 ? asNumber : -1;
    return db.product.findFirst({
      where: { OR: [{ code: String(idOrCode) }, { id: numeric }], deletedAt: null },
      include: { category: true },
    });
  },

  async findByCode(code, db = prisma) {
    return db.product.findFirst({
      where: { code },
      include: { category: true },
    });
  },

  findByCodes(codes, db = prisma) {
    return db.product.findMany({
      where: { code: { in: codes }, deletedAt: null },
      include: { category: true },
    });
  },

  findByIds(ids, db = prisma) {
    return db.product.findMany({ where: { id: { in: ids.map(Number) } } });
  },

  findBySku(sku, db = prisma) {
    return db.product.findFirst({ where: { sku, deletedAt: null } });
  },

  /**
   * Create a product, allocating its human code from `document_sequences`.
   *
   * The caller owns the transaction and passes its client as `db`, because the
   * code allocation (SELECT ... FOR UPDATE) has to be in the same transaction as
   * the insert and as the opening stock movement. Opening a nested transaction
   * here would break that atomicity.
   */
  async create(data, db = prisma) {
    const skuClash = await db.product.findFirst({ where: { sku: data.sku } });
    if (skuClash) {
      throw AppError.conflict(`SKU "${data.sku}" is already assigned to another product`, {
        details: { sku: 'SKU must be unique' },
      });
    }

    const code = await nextCode(db, SEQ.PRODUCT);
    return db.product.create({
      data: { ...data, code },
      include: { category: true },
    });
  },

  async update(idOrCode, data, db = prisma) {
    const product = await this.resolve(idOrCode, db);
    if (!product) throw AppError.notFound('Product not found');

    if (data.sku && data.sku !== product.sku) {
      const clash = await db.product.findFirst({
        where: { sku: data.sku, NOT: { id: product.id } },
      });
      if (clash) {
        throw AppError.conflict(`SKU "${data.sku}" is already assigned to another product`, {
          details: { sku: 'SKU must be unique' },
        });
      }
    }

    return db.product.update({
      where: { id: product.id },
      data,
      include: { category: true },
    });
  },

  async softDelete(idOrCode, db = prisma) {
    const product = await this.resolve(idOrCode, db);
    if (!product) throw AppError.notFound('Product not found');

    return db.product.update({
      where: { id: product.id },
      data: { deletedAt: new Date(), isActive: false },
    });
  },

  /**
   * Row-lock a product for the duration of the transaction, returning the locked
   * row's values.
   *
   * This is what makes concurrent sales safe: the second transaction blocks here
   * until the first commits, then reads the *post-deduction* quantity. That is
   * why callers must use the returned `stock_quantity` rather than a value they
   * read before locking — a pre-lock read can be stale by the time the lock is
   * granted, which is exactly the race that lets two sales oversell.
   *
   * Returns snake_case column names, or null when the row is gone.
   */
  async lockById(id, tx) {
    const rows = await tx.$queryRawUnsafe(
      `SELECT id, code, sku, name, unit, hsn_code, mrp, selling_price, cost_price,
              tax_rate, stock_quantity, min_stock_level
         FROM products
        WHERE id = ? AND deleted_at IS NULL
        FOR UPDATE`,
      Number(id)
    );
    const row = rows[0] ?? null;
    if (!row) return null;

    // Normalise to the Prisma model's field names so the rest of the code can
    // treat a locked row and a fetched row interchangeably.
    return {
      ...row,
      mrp: row.mrp,
      sellingPrice: row.selling_price,
      costPrice: row.cost_price,
      taxRate: row.tax_rate,
      stockQuantity: Number(row.stock_quantity),
      minStockLevel: Number(row.min_stock_level),
      hsnCode: row.hsn_code,
      deletedAt: null,
    };
  },

  /** Atomic relative stock update — belt and braces alongside the row lock. */
  applyStockDelta(id, delta, tx) {
    return tx.product.update({
      where: { id: Number(id) },
      data: { stockQuantity: { increment: Number(delta) } },
    });
  },

  /** Sales performance for one product over an optional date range. */
  async performance(id, { from, to } = {}, db = prisma) {
    const clauses = [Prisma.sql`ii.product_id = ${Number(id)}`];
    if (from) clauses.push(Prisma.sql`i.invoice_date >= ${from}`);
    if (to) clauses.push(Prisma.sql`i.invoice_date <= ${to}`);
    const where = Prisma.join(clauses, ' AND ');

    const [row] = await db.$queryRaw(Prisma.sql`
      SELECT
        COALESCE(SUM(ii.quantity), 0) AS units_sold,
        COALESCE(SUM(ii.line_total), 0) AS revenue,
        COALESCE(SUM(ii.taxable_value * ii.tax_rate / 100), 0) AS tax_collected,
        COUNT(DISTINCT i.id) AS invoices
      FROM invoice_items ii
      INNER JOIN invoices i ON i.id = ii.invoice_id
      WHERE ${where} AND i.deleted_at IS NULL AND i.status <> 'CANCELLED'
    `);

    return {
      unitsSold: Number(row?.units_sold ?? 0),
      revenue: row?.revenue ?? 0,
      taxCollected: row?.tax_collected ?? 0,
      invoices: Number(row?.invoices ?? 0),
    };
  },

  /**
   * Sales history for the product detail screen.
   * @param {number} productId numeric PK
   * @param {{from?:string,to?:string,limit?:number}} opts
   */
  async salesHistory(productId, { from, to, limit = 25 } = {}, db = prisma) {
    const clauses = [Prisma.sql`ii.product_id = ${Number(productId)}`];
    if (from) clauses.push(Prisma.sql`i.invoice_date >= ${from}`);
    if (to) clauses.push(Prisma.sql`i.invoice_date <= ${to}`);
    const where = Prisma.join(clauses, ' AND ');

    /*
     * `invoice_date` is wrapped in DATE_FORMAT deliberately. A bare DATE column
     * from $queryRaw arrives as a JS Date, and formatting it downstream with
     * String(date).slice(0, 10) yields "Sat Oct 03" instead of an ISO date.
     * Doing it in SQL matches how report.repo.js produces bucket keys, so every
     * date on the wire is YYYY-MM-DD.
     */
    return db.$queryRaw(Prisma.sql`
      SELECT
        i.invoice_number, i.sale_code, i.snapshot_name AS customer_name,
        DATE_FORMAT(i.invoice_date, '%Y-%m-%d') AS invoice_date,
        ii.quantity, ii.unit_price, ii.line_total, ii.tax_rate
      FROM invoice_items ii
      INNER JOIN invoices i ON i.id = ii.invoice_id
      WHERE ${where} AND i.deleted_at IS NULL AND i.status <> 'CANCELLED'
      ORDER BY i.invoice_date DESC, i.id DESC
      LIMIT ${Number(limit)}
    `);
  },

  /** Count of products in each derived status — used by the inventory filter chips. */
  async statusCounts(db = prisma) {
    const rows = await db.$queryRaw(Prisma.sql`
      SELECT
        ${STATUS_SQL} AS stock_status,
        COUNT(*) AS total
      FROM products p
      INNER JOIN categories c ON c.id = p.category_id
      WHERE p.deleted_at IS NULL
      GROUP BY stock_status
    `);
    const counts = { all: 0, in_stock: 0, low_stock: 0, out_of_stock: 0 };
    for (const row of rows) {
      const n = Number(row.total);
      counts[row.stock_status] = n;
      counts.all += n;
    }
    return counts;
  },

  /** Products at or below their reorder level, worst first. */
  async lowStock(limit = 100, db = prisma) {
    return db.$queryRaw(Prisma.sql`
      ${PRODUCT_SELECT}
      WHERE p.deleted_at IS NULL AND p.stock_quantity <= p.min_stock_level
      ORDER BY (p.min_stock_level - p.stock_quantity) DESC, p.stock_quantity ASC
      LIMIT ${Number(limit)}
    `);
  },

  /** Total stock valuation at cost. */
  async inventoryValue(db = prisma) {
    const [row] = await db.$queryRaw(Prisma.sql`
      SELECT
        COUNT(*) AS products,
        COALESCE(SUM(stock_quantity), 0) AS units,
        COALESCE(SUM(stock_quantity * cost_price), 0) AS cost_value,
        COALESCE(SUM(stock_quantity * selling_price), 0) AS retail_value
      FROM products
      WHERE deleted_at IS NULL
    `);
    return {
      products: Number(row?.products ?? 0),
      units: Number(row?.units ?? 0),
      costValue: row?.cost_value ?? 0,
      retailValue: row?.retail_value ?? 0,
    };
  },

  /** Resolve the category a payload references (by code or by name). */
  async resolveCategory(reference, tx = prisma) {
    const row = await tx.category.findFirst({
      where: { OR: [{ code: reference }, { name: reference }], deletedAt: null },
    });
    if (!row) {
      throw AppError.validation('Please select a category', {
        category: `No category matches "${reference}"`,
      });
    }
    return row;
  },
};

export { STATUS_SQL };
export default productRepo;