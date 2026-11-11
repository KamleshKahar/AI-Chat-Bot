/**
 * Human-readable document codes.
 *
 * The database uses BIGINT surrogate primary keys, but every identifier the
 * user actually sees is a code: PRD-101, CUST-001, CAT-01, SALE-1001,
 * INV-2026-009, CRN-2026-001, PAY-0001, TXN-901. Codes are allocated from the
 * `document_sequences` table using SELECT ... FOR UPDATE so two concurrent
 * transactions can never be handed the same number.
 */

export const SEQ = {
  PRODUCT: { prefix: 'PRD-', period: 'ALL', pad: 3, start: 1 },
  CUSTOMER: { prefix: 'CUST-', period: 'ALL', pad: 3, start: 1 },
  CATEGORY: { prefix: 'CAT-', period: 'ALL', pad: 2, start: 1 },
  SALE: { prefix: 'SALE-', period: 'ALL', pad: 4, start: 1 },
  PAYMENT: { prefix: 'PAY-', period: 'ALL', pad: 4, start: 1 },
  LEDGER: { prefix: 'TXN-', period: 'ALL', pad: 3, start: 1 },
};

/** Invoice numbering restarts every calendar year: INV-2026-001. */
export function invoiceSequence(year) {
  return { prefix: 'INV', period: String(year), pad: 3, start: 1 };
}

/** Credit notes follow the same yearly pattern: CRN-2026-001. */
export function creditNoteSequence(year) {
  return { prefix: 'CRN', period: String(year), pad: 3, start: 1 };
}

/**
 * Prefixes whose code embeds the allocation year: `INV-2026-009`. Everything
 * else is a single lifetime counter (`PRD-101`).
 */
const YEAR_EMBEDDED_PREFIXES = new Set(['INV', 'CRN']);

function pad(n, width) {
  return String(n).padStart(width, '0');
}

/**
 * Allocate the next code. MUST be called inside a transaction so the row lock
 * is held until commit.
 *
 * @param {import('@prisma/client').Prisma.TransactionClient} tx
 * @param {{prefix:string, period:string, pad:number}} spec
 * @returns {Promise<string>} the formatted code, e.g. 'PRD-101'
 */
export async function nextCode(tx, spec) {
  const { prefix, period, pad: width } = spec;

  // Lock the counter row for this (prefix, period). If it does not exist yet we
  // create it — under a UNIQUE(prefix, period) index the insert itself acts as
  // the lock, so two concurrent first-time allocations cannot both win.
  await tx.documentSequence.upsert({
    where: { prefix_period: { prefix, period } },
    create: { prefix, period, lastNumber: 0 },
    update: {},
  });

  const rows = await tx.$queryRawUnsafe(
    'SELECT `last_number` FROM `document_sequences` WHERE `prefix` = ? AND `period` = ? FOR UPDATE',
    prefix,
    period
  );

  const last = rows.length ? Number(rows[0].last_number) : 0;
  const next = last + 1;

  await tx.documentSequence.update({
    where: { prefix_period: { prefix, period } },
    data: { lastNumber: next },
  });

  // Invoice and credit-note codes embed the year, everything else does not.
  if (YEAR_EMBEDDED_PREFIXES.has(prefix)) return `${prefix}-${period}-${pad(next, width)}`;
  return `${prefix}${pad(next, width)}`;
}
