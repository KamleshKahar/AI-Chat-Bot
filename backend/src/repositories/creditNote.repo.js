import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma.js';

/**
 * Credit notes — the return side of an invoice.
 *
 * Same conventions as `invoice.repo.js`: the human-readable `CRN-2026-001`
 * code is what the API serialises as `id`, money lives in DECIMAL(14,2), and
 * every aggregate below is written in SQL so the report screens never pull
 * line-level data through JavaScript to add it up.
 */

const LIVE = Prisma.sql`cn.deleted_at IS NULL`;

function rangeFilter(from, to) {
  const clauses = [];
  if (from) clauses.push(Prisma.sql`cn.credit_date >= ${from}`);
  if (to) clauses.push(Prisma.sql`cn.credit_date <= ${to}`);
  return clauses.length ? Prisma.sql`AND ${Prisma.join(clauses, ' AND ')}` : Prisma.sql``;
}

const HEAD_SELECT = Prisma.sql`
  SELECT
    cn.id, cn.credit_note_number, cn.invoice_id, cn.customer_id,
    cn.credit_date, cn.reason,
    cn.subtotal, cn.discount_amount, cn.taxable_amount, cn.tax_type, cn.tax_rate,
    cn.cgst_amount, cn.sgst_amount, cn.igst_amount, cn.tax_amount, cn.grand_total,
    cn.snapshot_name, cn.snapshot_company, cn.snapshot_gstin, cn.snapshot_state,
    cn.created_at, cn.updated_at,
    i.invoice_number, c.code AS customer_code
  FROM credit_notes cn
  INNER JOIN invoices i ON i.id = cn.invoice_id
  INNER JOIN customers c ON c.id = cn.customer_id
`;

const ORDER_BY = {
  date: (order) => Prisma.sql`cn.credit_date ${order}, cn.id ${order}`,
  amount: (order) => Prisma.sql`cn.grand_total ${order}`,
};

export const creditNoteRepo = {
  /** Paginated credit-note list, newest first. */
  async list({ search, from, to, sort, order, skip, take }, db = prisma) {
    const clauses = [LIVE];

    if (search) {
      const like = `%${search}%`;
      clauses.push(Prisma.sql`
        (cn.credit_note_number LIKE ${like} OR i.invoice_number LIKE ${like}
         OR cn.snapshot_name LIKE ${like} OR cn.snapshot_company LIKE ${like})
      `);
    }

    const where = Prisma.sql`WHERE ${Prisma.join(clauses, ' AND ')} ${rangeFilter(from, to)}`;
    const dir = order === 'asc' ? Prisma.sql`ASC` : Prisma.sql`DESC`;
    const orderBy = (ORDER_BY[sort] ?? ORDER_BY.date)(dir);

    const heads = await db.$queryRaw(
      Prisma.sql`${HEAD_SELECT} ${where} ORDER BY ${orderBy} LIMIT ${take} OFFSET ${skip}`
    );
    const [{ total }] = await db.$queryRaw(
      Prisma.sql`
        SELECT COUNT(*) AS total
        FROM credit_notes cn
        INNER JOIN invoices i ON i.id = cn.invoice_id
        ${where}
      `
    );

    let rows = heads;
    if (heads.length > 0) rows = await this.attachItems(heads, db);
    return { rows, total: Number(total) };
  },

  /** Join line items for a set of heads in one round trip. */
  async attachItems(heads, db = prisma) {
    const ids = heads.map((h) => h.id);
    const items = await db.creditNoteItem.findMany({
      where: { creditNoteId: { in: ids } },
      orderBy: [{ creditNoteId: 'asc' }, { sortOrder: 'asc' }],
    });

    const byNote = new Map();
    for (const item of items) {
      if (!byNote.has(item.creditNoteId)) byNote.set(item.creditNoteId, []);
      byNote.get(item.creditNoteId).push(item);
    }
    return heads.map((h) => ({ ...h, items: byNote.get(h.id) ?? [] }));
  },

  /**
   * Resolve a path segment: `CRN-2026-001` or a numeric PK. Returns the full
   * Prisma row with items and the parent invoice number.
   */
  async resolve(idOrCode, db = prisma) {
    const asNumber = Number(idOrCode);
    const numeric = Number.isInteger(asNumber) && asNumber > 0 ? asNumber : -1;

    const [head] = await db.$queryRaw(Prisma.sql`
      SELECT cn.id, cn.credit_note_number
      FROM credit_notes cn
      WHERE cn.deleted_at IS NULL
        AND (cn.credit_note_number = ${String(idOrCode)} OR cn.id = ${numeric})
      LIMIT 1
    `);
    if (!head) return null;

    return db.creditNote.findUnique({
      where: { id: head.id },
      include: {
        items: { orderBy: { sortOrder: 'asc' } },
        invoice: { select: { invoiceNumber: true, taxType: true } },
        customer: { select: { code: true } },
      },
    });
  },

  /**
   * Units already credited per invoice line, counting only live notes —
   * a soft-deleted credit note frees its quantity back up again.
   *
   * @returns {Map<number, number>} invoiceItemId -> credited units
   */
  async creditedQuantities(invoiceId, db = prisma) {
    const rows = await db.$queryRaw(Prisma.sql`
      SELECT cni.invoice_item_id AS lineId, COALESCE(SUM(cni.quantity), 0) AS credited
      FROM credit_note_items cni
      INNER JOIN credit_notes cn ON cn.id = cni.credit_note_id
      WHERE cn.invoice_id = ${Number(invoiceId)} AND cn.deleted_at IS NULL
        AND cni.invoice_item_id IS NOT NULL
      GROUP BY cni.invoice_item_id
    `);
    return new Map(rows.map((r) => [Number(r.lineId), Number(r.credited)]));
  },

  /** Total value already credited against an invoice (live notes only). */
  async creditedTotal(invoiceId, db = prisma) {
    const rows = await db.$queryRaw(Prisma.sql`
      SELECT COALESCE(SUM(cn.grand_total), 0) AS credited
      FROM credit_notes cn
      WHERE cn.invoice_id = ${Number(invoiceId)} AND cn.deleted_at IS NULL
    `);
    return rows[0]?.credited ?? 0;
  },

  async softDelete(idOrCode, db = prisma) {
    const note = await this.resolve(idOrCode, db);
    if (!note) return null;
    return db.creditNote.update({
      where: { id: note.id },
      data: { deletedAt: new Date() },
    });
  },
};

export default creditNoteRepo;
