// Lightweight sanity checks for the billing maths.
// Run with: node --experimental-strip-types scripts/verify.js  (or just read the output)
import {
  calculateSaleTotals,
  computeCreditNoteTotals,
  resolvePaymentStatus,
  round2,
  allocate,
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

// 8. Per-line GST slabs (mixed-rate invoice)
//    0% on 200 + 28% on 1000 = 280 tax; the invoice-level 18% fallback
//    must NOT leak onto either line. Mirrors backend billing.test.js.
check(
  'mixed slabs taxed per line',
  (() => {
    const t = calculateSaleTotals({
      items: [
        { quantity: 2, unitPrice: 100, taxRate: 0 },
        { quantity: 1, unitPrice: 1000, taxRate: 28 },
      ],
      taxRate: 18,
    });
    return {
      lineRates: t.lineItems.map((l) => l.taxRate),
      taxAmount: t.taxAmount,
      grandTotal: t.grandTotal,
    };
  })(),
  { lineRates: [0, 28], taxAmount: 280, grandTotal: 1480 }
);

// 9. Lines without their own rate take the invoice-level fallback
check(
  'fallback rate applies only where no line rate is set',
  (() => {
    const t = calculateSaleTotals({
      items: [
        { quantity: 1, unitPrice: 1000 },
        { quantity: 1, unitPrice: 1000, taxRate: 5 },
      ],
      taxRate: 12,
    });
    return { lineRates: t.lineItems.map((l) => l.taxRate), taxAmount: t.taxAmount };
  })(),
  { lineRates: [12, 5], taxAmount: 170 }
);

// 10. Discount shares always sum back to the invoice discount (largest-remainder)
check(
  'discount allocation sums exactly',
  (() => {
    const t = calculateSaleTotals({
      items: [
        { quantity: 1, unitPrice: 333.33 },
        { quantity: 1, unitPrice: 333.33 },
        { quantity: 1, unitPrice: 333.34 },
      ],
      discountType: 'percent',
      discountValue: 10,
      taxRate: 18,
    });
    const shares = round2(t.lineItems.reduce((acc, l) => acc + l.discountAmount, 0));
    return { shares, invoice: t.discountAmount, taxable: t.taxableAmount };
  })(),
  { shares: 100, invoice: 100, taxable: 900 }
);

check(
  'allocate distributes leftover paise to the largest fractions',
  allocate(100, [333.33, 333.33, 333.34]),
  [33.33, 33.33, 33.34]
);

// 11. Credit-note preview: a FULL credit reproduces the invoice figures
//     (minus shipping — a return does not re-charge freight).
check(
  'full credit note reproduces the invoice',
  (() => {
    const invoice = calculateSaleTotals({
      items: [
        { quantity: 4, unitPrice: 3850, taxRate: 18 },
        { quantity: 2, unitPrice: 1950, taxRate: 12 },
      ],
      discountType: 'percent',
      discountValue: 5,
      taxRate: 18,
      shippingCharges: 100,
    });
    const credit = computeCreditNoteTotals({
      items: invoice.lineItems.map((l) => ({
        ...l,
        quantity: l.quantity,
        creditedQuantity: l.quantity,
      })),
      taxType: 'CGST_SGST',
    });
    return {
      subtotal: credit.subtotal,
      discountAmount: credit.discountAmount,
      taxableAmount: credit.taxableAmount,
      taxAmount: credit.taxAmount,
      grandTotal: credit.grandTotal,
      matchesInvoice: credit.taxAmount === invoice.taxAmount,
    };
  })(),
  {
    subtotal: 19300,
    discountAmount: 965,
    taxableAmount: 18335,
    taxAmount: 3078, // 18% of 14630 + 12% of 3705
    grandTotal: 21413, // invoice grand total 21513.00 less 100 shipping
    matchesInvoice: true,
  }
);

// 12. Partial credit scales the line's discount share proportionally
check(
  'partial credit scales proportionally',
  (() => {
    const c = computeCreditNoteTotals({
      items: [
        {
          quantity: 4,
          unitPrice: 3850,
          discountAmount: 770,
          taxRate: 18,
          creditedQuantity: 1,
        },
      ],
    });
    const line = c.lines[0];
    return {
      lineAmount: line.lineAmount,
      discountAmount: line.discountAmount,
      taxableValue: line.taxableValue,
      taxAmount: line.lineTax,
      grandTotal: c.grandTotal,
    };
  })(),
  {
    lineAmount: 3850,
    discountAmount: 192.5,
    taxableValue: 3657.5,
    taxAmount: 658.35,
    grandTotal: 4315.85,
  }
);

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);