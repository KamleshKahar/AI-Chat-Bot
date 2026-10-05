import { PrismaClient } from '@prisma/client';
import { env } from './env.js';

/**
 * Single PrismaClient for the process. Keeping one instance is required for
 * connection pooling to work.
 */
export const prisma = new PrismaClient({
  log: env.isProd ? ['warn', 'error'] : ['warn', 'error'],
});

/**
 * Prisma maps MySQL DATETIME to a JS Date. All business dates in FlowPilot are
 * *date-only* (invoice date, due date), so a consistent UTC-based conversion is
 * used everywhere instead of the local-time `toISOString().slice(0,10)` trick,
 * which silently shifts the day in negative-offset timezones.
 */

/** 'YYYY-MM-DD' for a Date / string, read in UTC. */
export function toDateOnly(value) {
  if (!value) return null;
  if (typeof value === 'string') return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

/** Parse a 'YYYY-MM-DD' string into a UTC-midnight Date (valid for @db.Date). */
export function toUtcDate(dateOnly) {
  return new Date(`${String(dateOnly).slice(0, 10)}T00:00:00.000Z`);
}

/** Today as 'YYYY-MM-DD' in the server's local calendar day. */
export function todayDateOnly(now = new Date()) {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Shift a date-only string by whole days, returning a date-only string. */
export function addDays(dateOnly, days) {
  const base = toUtcDate(dateOnly);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

/** Calendar year of a date-only value, as a string (used for INV-YYYY-NNN). */
export function yearOf(dateOnly) {
  return String(dateOnly).slice(0, 4);
}

/**
 * Run `fn(tx)` inside a transaction, passing through an existing one.
 *
 * Repositories accept a `db` that is either the PrismaClient or a transaction
 * client. A transaction client has no `$transaction` of its own, so calling it
 * unconditionally throws `db.$transaction is not a function`. This helper makes
 * both forms work, which keeps repository methods safe to call standalone *and*
 * safe to compose into a caller's larger transaction.
 */
export function withTransaction(db, fn) {
  if (typeof db?.$transaction === 'function') {
    return db.$transaction(fn);
  }
  return fn(db);
}