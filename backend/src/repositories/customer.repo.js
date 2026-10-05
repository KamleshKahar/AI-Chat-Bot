import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma.js';
import { withTransaction } from '../config/prisma.js';
import { SEQ, nextCode } from '../lib/codes.js';
import { AppError } from '../errors/AppError.js';

/**
 * Customers.
 *
 * The frontend renders three derived columns — totalPurchases,
 * outstandingBalance and ordersCount. None of them are cached columns: they are
 * computed by a LEFT JOINed aggregate over live invoices, so they can never drift
 * from the documents that produced them.
 *
 * `outstandingBalance` = opening_balance (pre-system dues) + SUM(invoices.balance_due)
 *
 * Sorting by those derived values is done in SQL for the same reason product
 * stock status is: the sort must participate in choosing the page, not be
 * applied to rows already chosen.
 */
const INVOICE_AGG = Prisma.sql`
  LEFT JOIN (
    SELECT
      customer_id,
      SUM(grand_total) AS total_purchases,
      SUM(balance_due) AS invoice_balance,
      COUNT(*)         AS orders_count
    FROM invoices
    WHERE deleted_at IS NULL AND status <> 'CANCELLED'
    GROUP BY customer_id
  ) agg ON agg.customer_id = c.id
`;

const OUTSTANDING = Prisma.sql`(c.opening_balance + COALESCE(agg.invoice_balance, 0))`;

const CUSTOMER_SELECT = Prisma.sql`
  SELECT
    c.id, c.code, c.name, c.company, c.email, c.phone, c.address,
    c.city, c.state, c.pincode, c.gstin, c.credit_limit, c.opening_balance,
    c.status, c.joined_at, c.created_at, c.updated_at,
    COALESCE(agg.total_purchases, 0) AS total_purchases,
    ${OUTSTANDING}                   AS outstanding_balance,
    COALESCE(agg.orders_count, 0)    AS orders_count
  FROM customers c
  ${INVOICE_AGG}
`;

function buildWhere({ search, status, balance }) {
  const clauses = [Prisma.sql`c.deleted_at IS NULL`];

  if (search) {
    const like = `%${search}%`;
    clauses.push(Prisma.sql`
      (c.name LIKE ${like} OR c.company LIKE ${like} OR c.email LIKE ${like}
       OR c.phone LIKE ${like} OR c.city LIKE ${like} OR c.gstin LIKE ${like})
    `);
  }

  if (status) clauses.push(Prisma.sql`c.status = ${status}`);

  if (balance === 'has_dues') clauses.push(Prisma.sql`${OUTSTANDING} > 0`);
  if (balance === 'clear') clauses.push(Prisma.sql`${OUTSTANDING} <= 0`);

  return Prisma.sql`WHERE ${Prisma.join(clauses, ' AND ')}`;
}

const ORDER_BY = {
  name: (order) => Prisma.sql`c.name ${order}`,
  value: (order) => Prisma.sql`COALESCE(agg.total_purchases, 0) ${order}`,
  outstanding: (order) => Prisma.sql`${OUTSTANDING} ${order}`,
  orders: (order) => Prisma.sql`COALESCE(agg.orders_count, 0) ${order}`,
  recent: () => Prisma.sql`c.joined_at DESC, c.id DESC`,
};

export const customerRepo = {
  async list({ search, status, balance, sort, order, skip, take }, db = prisma) {
    const where = buildWhere({ search, status, balance });
    const dir = order === 'desc' ? Prisma.sql`DESC` : Prisma.sql`ASC`;
    const orderBy = (ORDER_BY[sort] ?? ORDER_BY.name)(dir);

    const rows = await db.$queryRaw(
      Prisma.sql`${CUSTOMER_SELECT} ${where} ORDER BY ${orderBy}, c.id ${dir} LIMIT ${take} OFFSET ${skip}`
    );

    const [{ total }] = await db.$queryRaw(
      Prisma.sql`SELECT COUNT(*) AS total FROM customers c ${INVOICE_AGG} ${where}`
    );

    return { rows, total: Number(total) };
  },

  async resolve(idOrCode, db = prisma) {
    const asNumber = Number(idOrCode);
    const numeric = Number.isInteger(asNumber) && asNumber > 0 ? asNumber : -1;
    const [row] = await db.$queryRaw(Prisma.sql`
      ${CUSTOMER_SELECT}
      WHERE c.deleted_at IS NULL AND (c.code = ${String(idOrCode)} OR c.id = ${numeric})
    `);
    return row ?? null;
  },

  async create(data, db = prisma) {
    const { outstandingBalance = 0, ...rest } = data;

    if (rest.gstin) {
      const clash = await db.customer.findFirst({ where: { gstin: rest.gstin } });
      if (clash) {
        throw AppError.conflict(`GSTIN ${rest.gstin} is already registered to another customer`, {
          details: { gstin: 'GSTIN must be unique' },
        });
      }
    }

    // Code allocation must be atomic with the insert (see withTransaction).
    const created = await withTransaction(db, async (tx) => {
      const code = await nextCode(tx, SEQ.CUSTOMER);
      return tx.customer.create({
        data: {
          ...rest,
          gstin: rest.gstin || null,
          openingBalance: outstandingBalance,
          code,
        },
      });
    });

    return this.resolve(created.code, db);
  },

  async update(idOrCode, data, db = prisma) {
    const existing = await this.resolve(idOrCode, db);
    if (!existing) throw AppError.notFound('Customer not found');

    const { outstandingBalance, ...rest } = data;

    if (rest.gstin && rest.gstin !== existing.gstin) {
      const clash = await db.customer.findFirst({
        where: { gstin: rest.gstin, NOT: { id: existing.id } },
      });
      if (clash) {
        throw AppError.conflict(`GSTIN ${rest.gstin} is already registered to another customer`, {
          details: { gstin: 'GSTIN must be unique' },
        });
      }
    }

    await db.customer.update({
      where: { id: existing.id },
      data: { ...rest, ...(outstandingBalance !== undefined ? { openingBalance: outstandingBalance } : {}) },
    });

    return this.resolve(existing.code, db);
  },

  async softDelete(idOrCode, db = prisma) {
    const existing = await this.resolve(idOrCode, db);
    if (!existing) throw AppError.notFound('Customer not found');

    await db.customer.update({
      where: { id: existing.id },
      data: { deletedAt: new Date(), status: 'inactive' },
    });
    return existing;
  },

  /** Invoice history for the customer detail screen. */
  purchaseHistory(customerId, { limit = 25 } = {}, db = prisma) {
    return db.invoice.findMany({
      where: { customerId: Number(customerId), deletedAt: null },
      orderBy: [{ invoiceDate: 'desc' }, { id: 'desc' }],
      take: Number(limit),
      include: { items: { select: { id: true }, orderBy: { sortOrder: 'asc' } } },
    });
  },

  /** Totals used by the dashboard and customer performance reports. */
  async totals(db = prisma) {
    const [row] = await db.$queryRaw(Prisma.sql`
      SELECT
        COUNT(*) AS customers,
        COALESCE(SUM(${OUTSTANDING}), 0) AS outstanding
      FROM customers c
      ${INVOICE_AGG}
      WHERE c.deleted_at IS NULL
    `);
    return {
      customers: Number(row?.customers ?? 0),
      outstanding: row?.outstanding ?? 0,
    };
  },

  listAllActive(db = prisma) {
    return db.customer.findMany({
      where: { deletedAt: null },
      orderBy: { code: 'asc' },
    });
  },
};

export { OUTSTANDING, INVOICE_AGG };
export default customerRepo;