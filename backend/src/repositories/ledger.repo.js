import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma.js';

/**
 * Cash ledger — the structured replacement for the frontend's free-form
 * `transactions` array.
 *
 * Every entry records what moved, which way, how much, how, and which document
 * (if any) caused it. `entry_type` + `direction` + `is_settlement` are what the
 * API turns back into the familiar "Income" / "Income (Partial)" / "Payment
 * Received" / "Stock Purchase" / "Stock In" / "Stock Out" labels.
 */
export const ledgerRepo = {
  create(data, db = prisma) {
    return db.ledgerEntry.create({ data });
  },

  async list({ search, type, direction, from, to, sort, order, skip, take }, db = prisma) {
    const clauses = [Prisma.sql`1 = 1`];

    if (search) {
      const like = `%${search}%`;
      clauses.push(Prisma.sql`
        (l.reference LIKE ${like} OR l.supplier_name LIKE ${like} OR l.notes LIKE ${like}
         OR c.name LIKE ${like} OR c.company LIKE ${like} OR i.invoice_number LIKE ${like})
      `);
    }
    if (type) clauses.push(Prisma.sql`l.type = ${type}`);
    if (direction) clauses.push(Prisma.sql`l.direction = ${direction}`);
    if (from) clauses.push(Prisma.sql`l.entry_date >= ${from}`);
    if (to) clauses.push(Prisma.sql`l.entry_date <= ${to}`);

    const where = Prisma.sql`WHERE ${Prisma.join(clauses, ' AND ')}`;
    const dir = order === 'asc' ? Prisma.sql`ASC` : Prisma.sql`DESC`;
    const orderBy =
      sort === 'amount' ? Prisma.sql`l.amount ${dir}` : Prisma.sql`l.entry_date ${dir}, l.id ${dir}`;

    const rows = await db.$queryRaw(Prisma.sql`
      SELECT
        l.id, l.entry_code, l.entry_date, l.direction, l.type, l.amount,
        l.payment_method, l.reference, l.customer_id, l.invoice_id, l.supplier_name,
        l.status, l.is_settlement, l.notes, l.created_at,
        c.code AS customer_code,
        c.name AS customer_name,
        i.invoice_number
      FROM ledger_entries l
      LEFT JOIN customers c ON c.id = l.customer_id
      LEFT JOIN invoices i ON i.id = l.invoice_id
      ${where}
      ORDER BY ${orderBy}
      LIMIT ${take} OFFSET ${skip}
    `);

    const [{ total }] = await db.$queryRaw(Prisma.sql`
      SELECT COUNT(*) AS total
      FROM ledger_entries l
      LEFT JOIN customers c ON c.id = l.customer_id
      LEFT JOIN invoices i ON i.id = l.invoice_id
      ${where}
    `);

    return { rows, total: Number(total) };
  },

  async recent(limit = 5, db = prisma) {
    const { rows } = await this.list(
      { sort: 'date', order: 'desc', skip: 0, take: Number(limit) },
      db
    );
    return rows;
  },

  /** Cash in / cash out over a window. */
  async directionTotals({ from, to } = {}, db = prisma) {
    const clauses = [Prisma.sql`1 = 1`];
    if (from) clauses.push(Prisma.sql`l.entry_date >= ${from}`);
    if (to) clauses.push(Prisma.sql`l.entry_date <= ${to}`);

    const rows = await db.$queryRaw(Prisma.sql`
      SELECT l.direction, COALESCE(SUM(l.amount), 0) AS total, COUNT(*) AS entries
      FROM ledger_entries l
      WHERE ${Prisma.join(clauses, ' AND ')} AND l.status = 'SUCCESS'
      GROUP BY l.direction
    `);

    const out = { IN: 0, OUT: 0, inEntries: 0, outEntries: 0 };
    for (const row of rows) {
      if (row.direction === 'IN') {
        out.IN = row.total;
        out.inEntries = Number(row.entries);
      } else {
        out.OUT = row.total;
        out.outEntries = Number(row.entries);
      }
    }
    return out;
  },
};

export default ledgerRepo;