import Decimal from 'decimal.js';

/**
 * Exact decimal arithmetic for money.
 *
 * Every monetary value in FlowPilot is DECIMAL(14,2) in MySQL and a Decimal
 * instance in memory. Floating point is only introduced at the very last step,
 * when a value is serialised to JSON for the browser — and only because
 * DECIMAL(14,2) tops out at 999,999,999,999.99, far below Number.MAX_SAFE_INTEGER.
 *
 * Rounding is ROUND_HALF_UP, which matches the frontend's
 * `Math.round((x + Number.EPSILON) * 100) / 100` for all non-negative amounts
 * (the only amounts this app produces).
 */
Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

/** Coerce anything (string | number | Decimal | null) into a Decimal. */
export function d(value) {
  if (value === null || value === undefined || value === '') return new Decimal(0);
  if (value instanceof Decimal) return value;
  return new Decimal(value);
}

/** Round to 2 decimal places, half-up. */
export function money(value) {
  return d(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

/** Money as a plain JSON number, rounded to 2dp. */
export function asMoney(value) {
  return Number(money(value));
}

/** Plain JSON number with no rounding (quantities, tax rates, counters). */
export function asNum(value) {
  return Number(d(value));
}

/** Zero. Handy as a default. */
export const ZERO = new Decimal(0);

/**
 * Split `total` across `weights` so the parts sum to exactly `total`.
 *
 * Uses the largest-remainder method: each part gets its share truncated to 2dp,
 * then the leftover paise are handed out one at a time to the parts with the
 * largest fractional remainder. Without this, rounding 3 discounted lines
 * independently produces a total that is off by a few paise from the invoice's
 * own tax figure — which is exactly the kind of drift a GST audit notices.
 *
 * @param {Decimal} total   amount to distribute
 * @param {Decimal[]} weights relative sizes of each part
 * @returns {Decimal[]} `weights.length` values summing exactly to `total`
 */
export function allocate(total, weights) {
  const target = money(total);
  const n = weights.length;
  if (n === 0) return [];

  const totalWeight = weights.reduce((acc, w) => acc.plus(d(w)), ZERO);
  if (totalWeight.isZero()) {
    // Nothing to weigh against — give everything to the first slot.
    return weights.map((_, i) => (i === 0 ? target : money(0)));
  }

  const exact = weights.map((w) => target.mul(d(w)).div(totalWeight));
  const floored = exact.map((v) => v.toDecimalPlaces(2, Decimal.ROUND_DOWN));

  let assigned = floored.reduce((acc, v) => acc.plus(v), ZERO);
  let leftover = target.minus(assigned); // in paise units, always >= 0

  // Rank by the discarded fraction, descending; hand out +0.01 to the top ones.
  const order = exact
    .map((v, i) => ({ i, frac: v.minus(floored[i]) }))
    .sort((a, b) => b.frac.comparedTo(a.frac) || a.i - b.i);

  const result = floored.slice();
  const step = new Decimal('0.01');
  let cursor = 0;
  while (leftover.greaterThan(0) && order.length > 0) {
    result[order[cursor % order.length].i] = result[order[cursor % order.length].i].plus(step);
    leftover = leftover.minus(step);
    cursor += 1;
  }

  return result;
}

/** Sum Decimals safely. */
export function sum(values) {
  return values.reduce((acc, v) => acc.plus(d(v)), ZERO);
}