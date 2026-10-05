import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma.js';
import { AppError } from '../errors/AppError.js';
import { todayDateOnly } from '../config/prisma.js';

/**
 * Invoices — the single source of truth behind BOTH the Sales screen and the
 * Invoices screen. There is deliberately no `sales` table: two tables holding
 * near-duplicate money columns is how a system ends up with a sale that says
 * ₹21,635.30 and an invoice that says ₹21,635.00.
 *
 * `GET /api/sales` and `GET /api/invoices` read this same table and differ only
 * in how the serializer shapes the result.
 */

/**
 * Overdue is a function of (payment_status, due_date, balance_due) — never a
 * stored value. `today` is passed in from the application rather than using
 * CURDATE() so the database session timezone can never disagree with the server.
 *
 * The four statuses are a true *partition*: every invoice lands in exactly one,
 * so `Paid + Partial + Pending + Overdue` always equals the unfiltered total and
 * no row is double counted across tabs. That forces Pending and Partial to
 * exclude the overdue ones — filtering `Partial` must not return an invoice
 * whose displayed `paymentStatus` is "Overdue", and the chip counts
 * (`paymentStatusCounts`) are derived with exactly these same predicates.
 */
function statusClause(status, today) {
  const pastDue = Prisma.sql`(i.balance_due > 0 AND i.due_date < ${today})`;

  if (status === 'Overdue') {
    return Prisma.sql`(i.payment_status <> 'PAID' AND ${pastDue})`;
  }
  if (status === 'Pending') {
    return Prisma.sql`(i.payment_status = 'PENDING' AND NOT ${pastDue})`;
  }
  if (status === 'Partial') {
    return Prisma.sql`(i.payment_status = 'PARTIAL' AND NOT ${pastDue})`;
  }
  if (status === 'Paid') return Prisma.sql`i.payment_status = 'PAID'`;
  return null;
}

function buildWhere({ search, paymentStatus, paymentMethod, from, to }) {
  const today = todayDateOnly();
  const clauses = [
    Prisma.sql`i.deleted_at IS NULL`,
    Prisma.sql`i.status <> 'CANCELLED'`,
  ];

  if (search) {
    const like = `%${search}%`;
    clauses.push(Prisma.sql`
      (i.invoice_number LIKE ${like} OR i.sale_code LIKE ${like}
       OR i.snapshot_name LIKE ${like} OR i.snapshot_company LIKE ${like})
    `);
  }

  const status = paymentStatus ? statusClause(paymentStatus, today) : null;
  if (status) clauses.push(status);

  if (paymentMethod) clauses.push(Prisma.sql`i.payment_method = ${paymentMethod}`);
  if (from) clauses.push(Prisma.sql`i.invoice_date >= ${from}`);
  if (to) clauses.push(Prisma.sql`i.invoice_date <= ${to}`);

  return Prisma.sql`WHERE ${Prisma.join(clauses, ' AND ')}`;
}

const ORDER_BY = {
  date: (order) => Prisma.sql`i.invoice_date ${order}, i.id ${order}`,
  due: (order) => Prisma.sql`i.due_date ${order}, i.id ${order}`,
  amount: (order) => Prisma.sql`i.grand_total ${order}`,
  balance: (order) => Prisma.sql`i.balance_due ${order}`,
};

const HEAD_SELECT = Prisma.sql`
  SELECT
    i.id, i.invoice_number, i.sale_code, i.customer_id,
    i.invoice_date, i.due_date,
    i.subtotal, i.discount_type, i.discount_value, i.discount_percent, i.discount_amount,
    i.taxable_amount, i.tax_type, i.tax_rate,
    i.cgst_amount, i.sgst_amount, i.igst_amount, i.tax_amount,
    i.shipping_charges, i.grand_total, i.paid_amount, i.balance_due,
    i.payment_status, i.payment_method, i.status, i.notes, i.terms,
    i.snapshot_name, i.snapshot_company, i.snapshot_email, i.snapshot_phone,
    i.snapshot_address, i.snapshot_city, i.snapshot_state, i.snapshot_pincode,
    i.snapshot_gstin,
    i.created_at, i.updated_at,
    c.code AS customer_code
  FROM invoices i
  INNER JOIN customers c ON c.id = i.customer_id
`;

export const invoiceRepo = {
  /**
   * Paginated invoice/sale list. Always returns the document head; `includeItems`
   * controls whether line items are joined in (the frontend's Sales and Invoices
   * tables both render an item count or a line summary, so items are included).
   */
  async list(
    { search, paymentStatus, paymentMethod, from, to, sort, order, skip, take, includeItems = true },
    db = prisma
  ) {
    const where = buildWhere({ search, paymentStatus, paymentMethod, from, to });
    const dir = order === 'asc' ? Prisma.sql`ASC` : Prisma.sql`DESC`;
    const orderBy = (ORDER_BY[sort] ?? ORDER_BY.date)(dir);

    const heads = await db.$queryRaw(
      Prisma.sql`${HEAD_SELECT} ${where} ORDER BY ${orderBy} LIMIT ${take} OFFSET ${skip}`
    );

    const [{ total }] = await db.$queryRaw(
      Prisma.sql`
        SELECT COUNT(*) AS total
        FROM invoices i
        INNER JOIN customers c ON c.id = i.customer_id
        ${where}
      `
    );

    let rows = heads;
    if (includeItems && heads.length > 0) {
      rows = await this.attachItems(heads, db);
    }

    return { rows, total: Number(total) };
  },

  /** Join line items for a set of invoice heads in one round trip. */
  async attachItems(heads, db = prisma) {
    const ids = heads.map((h) => h.id);
    const items = await db.invoiceItem.findMany({
      where: { invoiceId: { in: ids } },
      orderBy: [{ invoiceId: 'asc' }, { sortOrder: 'asc' }],
    });

    const byInvoice = new Map();
    for (const item of items) {
      if (!byInvoice.has(item.invoiceId)) byInvoice.set(item.invoiceId, []);
      byInvoice.get(item.invoiceId).push(item);
    }
    return heads.map((h) => ({ ...h, items: byInvoice.get(h.id) ?? [] }));
  },

  /**
   * Resolve a path segment. Accepts an invoice number (INV-2026-001), a sale
   * code (SALE-1001) or a numeric PK — the frontend uses all three in different
   * places.
   */
  async resolve(idOrCode, db = prisma) {
    const asNumber = Number(idOrCode);
    const numeric = Number.isInteger(asNumber) && asNumber > 0 ? asNumber : -1;

    const [row] = await db.$queryRaw(Prisma.sql`
      ${HEAD_SELECT}
      WHERE i.deleted_at IS NULL
        AND (i.invoice_number = ${String(idOrCode)} OR i.sale_code = ${String(idOrCode)} OR i.id = ${numeric})
      LIMIT 1
    `);
    if (!row) return null;

    const full = await db.invoice.findUnique({
      where: { id: row.id },
      include: {
        items: { orderBy: { sortOrder: 'asc' } },
        payments: { orderBy: { paidAt: 'asc' } },
        customer: true,
      },
    });
    return full;
  },

  /** Head + items only (for the list projections). */
  async findWithItems(idOrCode, db = prisma) {
    const head = await this.resolve(idOrCode, db);
    if (!head) return null;
    return head;
  },

  findByNumber(invoiceNumber, db = prisma) {
    return db.invoice.findUnique({ where: { invoiceNumber } });
  },

  create(data, db = prisma) {
    return db.invoice.create({
      data,
      include: { items: { orderBy: { sortOrder: 'asc' } } },
    });
  },

  /** Recompute the money triad after a payment lands. */
  async applyPaymentState(invoiceId, { paidAmount, grandTotal, paymentStatus }, db = prisma) {
    return db.invoice.update({
      where: { id: Number(invoiceId) },
      data: { paidAmount, balanceDue: grandTotal.minus(paidAmount), paymentStatus },
    });
  },

  update(invoiceId, data, db = prisma) {
    return db.invoice.update({
      where: { id: Number(invoiceId) },
      data,
      include: { items: { orderBy: { sortOrder: 'asc' } } },
    });
  },

  async softDelete(idOrCode, db = prisma) {
    const invoice = await this.resolve(idOrCode, db);
    if (!invoice) throw AppError.notFound('Invoice not found');

    return db.invoice.update({
      where: { id: invoice.id },
      data: { deletedAt: new Date(), status: 'CANCELLED' },
    });
  },

  /** Payment rows for one invoice. */
  paymentsFor(invoiceId, db = prisma) {
    return db.payment.findMany({
      where: { invoiceId: Number(invoiceId) },
      orderBy: { paidAt: 'asc' },
    });
  },

  /**
   * Headline invoice totals across every non-cancelled invoice.
   * `totalRevenue` follows the frontend definition exactly: money actually
   * collected (SUM of paid_amount), not invoiced value.
   */
  async headlineTotals(db = prisma) {
    const [row] = await db.$queryRaw(Prisma.sql`
      SELECT
        COUNT(*)                                          AS total_orders,
        COALESCE(SUM(grand_total), 0)                     AS total_sales_value,
        COALESCE(SUM(paid_amount), 0)                      AS total_revenue,
        COALESCE(SUM(balance_due), 0)                      AS total_balance,
        COALESCE(SUM(tax_amount), 0)                       AS total_tax,
        COALESCE(SUM(discount_amount), 0)                  AS total_discount
      FROM invoices
      WHERE deleted_at IS NULL AND status <> 'CANCELLED'
    `);

    return {
      totalOrders: Number(row?.total_orders ?? 0),
      totalSalesValue: row?.total_sales_value ?? 0,
      totalRevenue: row?.total_revenue ?? 0,
      totalBalance: row?.total_balance ?? 0,
      totalTax: row?.total_tax ?? 0,
      totalDiscount: row?.total_discount ?? 0,
    };
  },

  /**
   * Count invoices per derived payment status — powers the invoice filter chips.
   *
   * Written as a derived table on purpose. Naming the CASE alias
   * `payment_status` and then writing `GROUP BY payment_status` makes MySQL bind
   * the GROUP BY to the *table column* `invoices.payment_status`, which silently
   * collapses the derived Overdue bucket back into Pending/Partial: the chip
   * would read 0 while `?paymentStatus=Overdue` returned rows. Inside the
   * subquery `status.payment_status` can only be the derived column.
   */
  async paymentStatusCounts(db = prisma) {
    const today = todayDateOnly();
    const rows = await db.$queryRaw(Prisma.sql`
      SELECT status.payment_status, COUNT(*) AS total
      FROM (
        SELECT
          CASE
            WHEN i.payment_status = 'PAID' THEN 'Paid'
            WHEN i.balance_due > 0 AND i.due_date < ${today} THEN 'Overdue'
            WHEN i.payment_status = 'PARTIAL' THEN 'Partial'
            ELSE 'Pending'
          END AS payment_status
        FROM invoices i
        WHERE i.deleted_at IS NULL AND i.status <> 'CANCELLED'
      ) AS status
      GROUP BY status.payment_status
    `);
    const counts = { All: 0, Paid: 0, Partial: 0, Pending: 0, Overdue: 0 };
    for (const row of rows) {
      const n = Number(row.total);
      counts[row.payment_status] = n;
      counts.All += n;
    }
    return counts;
  },
/**
   * Receivables aging: how much money is owed and how late it is.
   * Buckets are computed from due_date against `today`, which is supplied by
   * the application so the database session timezone cannot skew the result.
   */
  /** Total money past its due date — the "Overdue" figure on the dashboard. */
  async overdueTotal(db = prisma) {
    const today = todayDateOnly();
    const rows = await db.$queryRaw(Prisma.sql`
      SELECT COALESCE(SUM(i.balance_due), 0) AS overdueAmount
      FROM invoices i
      WHERE i.deleted_at IS NULL
        AND i.status <> 'CANCELLED'
        AND i.balance_due > 0
        AND i.due_date < ${today}
    `);
    return { overdueAmount: rows[0]?.overdueAmount ?? 0 };
  },

  async agingBuckets(db = prisma) {
    const today = todayDateOnly();
    const rows = await db.$queryRaw(Prisma.sql`
      SELECT
        CASE
          WHEN i.balance_due <= 0 THEN 'settled'
          WHEN i.due_date >= ${today} THEN 'current'
          WHEN i.due_date >= DATE_SUB(${today}, INTERVAL 30 DAY) THEN '1-30'
          WHEN i.due_date >= DATE_SUB(${today}, INTERVAL 60 DAY) THEN '31-60'
          ELSE '60+'
        END AS bucket,
        COUNT(*)                        AS invoices,
        COALESCE(SUM(i.balance_due), 0) AS amount
      FROM invoices i
      WHERE i.deleted_at IS NULL AND i.status <> 'CANCELLED'
      GROUP BY bucket
    `);

    const order = ['settled', 'current', '1-30', '31-60', '60+'];
    const byBucket = new Map(rows.map((r) => [r.bucket, r]));
    return order.map((bucket) => ({
      bucket,
      invoices: Number(byBucket.get(bucket)?.invoices ?? 0),
      amount: byBucket.get(bucket)?.amount ?? 0,
    }));
  },
};

export default invoiceRepo;