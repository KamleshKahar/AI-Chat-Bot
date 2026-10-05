// Lightweight sanity checks for the billing maths.
// Run with: node --experimental-strip-types scripts/verify.js  (or just read the output)
import {
  calculateSaleTotals,
  resolvePaymentStatus,
  round2,
  filterByDateRange,
} from '../lib/salesLogic.js';

let failures = 0;

const check = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) {
    failures += 1;
    console.log(`FAIL  ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  } else {
    console.log(`ok    ${label} -> ${JSON.stringify(actual)}`);
  }
};

// 1. Basic subtotal + tax, no discount
check(
  'percent discount + tax',
  (() => {
    const t = calculateSaleTotals({
      items: [
        { quantity: 4, unitPrice: 3850 },
        { quantity: 2, unitPrice: 1950 },
      ],
      discountType: 'percent',
      discountValue: 5,
      taxRate: 18,
    });
    return {
      subtotal: t.subtotal,
      discountAmount: t.discountAmount,
      taxAmount: t.taxAmount,
      grandTotal: t.grandTotal,
    };
  })(),
  {
    subtotal: 19300,
    discountAmount: 965,
    taxAmount: 3300.3,
    grandTotal: 21635.3,
  }
);

// 2. Flat discount, shipping added after tax
//    subtotal 3000 - 500 discount = 2500 taxable; +18% GST = 2950; + 150 shipping = 3100
check(
  'flat discount + shipping',
  (() => {
    const t = calculateSaleTotals({
      items: [{ quantity: 3, unitPrice: 1000 }],
      discountType: 'flat',
      discountValue: 500,
      taxRate: 18,
      shippingCharges: 150,
    });
    return {
      subtotal: t.subtotal,
      discountAmount: t.discountAmount,
      taxAmount: t.taxAmount,
      grandTotal: t.grandTotal,
    };
  })(),
  { subtotal: 3000, discountAmount: 500, taxAmount: 450, grandTotal: 3100 }
);

// 3. Discount cannot exceed subtotal
check(
  'discount clamped to subtotal',
  calculateSaleTotals({
    items: [{ quantity: 1, unitPrice: 500 }],
    discountType: 'flat',
    discountValue: 9999,
    taxRate: 0,
  }).discountAmount,
  500
);

// 4. Empty cart totals to zero
check(
  'empty cart',
  (() => {
    const t = calculateSaleTotals({ items: [], taxRate: 18 });
    return { subtotal: t.subtotal, taxAmount: t.taxAmount, grandTotal: t.grandTotal };
  })(),
  { subtotal: 0, taxAmount: 0, grandTotal: 0 }
);

// 5. Payment status resolution
check('payment status full', resolvePaymentStatus(1000, 1000), 'Paid');
check('payment status partial', resolvePaymentStatus(1000, 400), 'Partial');
check('payment status none', resolvePaymentStatus(1000, 0), 'Pending');
check('payment status overpaid', resolvePaymentStatus(1000, 1500), 'Paid');

// 6. Floating point safety
check('rounding 0.1 + 0.2', round2(0.1 + 0.2), 0.3);
check(
  'floating point tax on 21635.30',
  calculateSaleTotals({
    items: [{ quantity: 1, unitPrice: 18000 }],
    discountType: 'percent',
    discountValue: 0,
    taxRate: 18,
  }).taxAmount,
  3240
);

// 7. Date range filtering uses inclusive ISO string bounds
const sampleSales = [
  { id: 'a', date: '2026-09-28', grandTotal: 100 },
  { id: 'b', date: '2026-10-01', grandTotal: 200 },
  { id: 'c', date: '2026-10-05', grandTotal: 300 },
];
check(
  'inclusive date range',
  filterByDateRange(sampleSales, '2026-09-28', '2026-10-01').map((s) => s.id),
  ['a', 'b']
);

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);