import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeInvoiceTotals,
  computeCreditNoteTotals,
  resolvePaymentStatusEnum,
  resolveSettlementState,
  BillingError,
} from '../src/lib/billing.js';

/**
 * The billing engine is the single source of truth for money. Two invariants
 * matter more than any individual figure:
 *
 *   1. every rupee reconciles — line parts always sum to the invoice total;
 *   2. a FULL credit note reproduces the invoice's own totals to the paisa,
 *      so a fully-credited invoice nets to exactly zero.
 *
 * These tests pin both, plus the per-line GST slab behaviour this feature
 * introduced (mixed-rate invoices no longer have a single tax rate).
 */

const n = (x) => Number(x);

describe('computeInvoiceTotals — per-line GST slabs', () => {
  test('single-rate invoice matches the classic invoice-level formula', () => {
    const t = computeInvoiceTotals({
      items: [
        { quantity: 4, unitPrice: 3850 },
        { quantity: 2, unitPrice: 1950 },
      ],
      discountType: 'percent',
      discountValue: 5,
      taxRate: 18,
    });

    assert.equal(n(t.subtotal), 19300);
    assert.equal(n(t.discountAmount), 965);
    assert.equal(n(t.taxableAmount), 18335);
    assert.equal(n(t.taxAmount), 3300.3);
    assert.equal(n(t.grandTotal), 21635.3);
    assert.equal(n(t.cgstAmount), 1650.15);
    assert.equal(n(t.sgstAmount), 1650.15);
    assert.equal(n(t.igstAmount), 0);
    assert.equal(t.totalItems, 6);
  });

  test('mixed slabs: each line is taxed at ITS OWN rate', () => {
    const t = computeInvoiceTotals({
      items: [
        { quantity: 2, unitPrice: 100, taxRate: 0 },
        { quantity: 1, unitPrice: 1000, taxRate: 28 },
      ],
      taxRate: 18, // invoice fallback — must NOT leak onto either line
    });

    assert.equal(n(t.lines[0].taxRate), 0);
    assert.equal(n(t.lines[1].taxRate), 28);
    assert.equal(n(t.lines[0].taxableValue), 200);
    assert.equal(n(t.lines[1].taxableValue), 1000);
    // 0% of 200 + 28% of 1000
    assert.equal(n(t.taxAmount), 280);
    assert.equal(n(t.grandTotal), 1480);
    // Header fallback rate is persisted as-is, for display only.
    assert.equal(n(t.taxRate), 18);
  });

  test('a 0% slab survives: `??` falls back only when no rate is supplied', () => {
    const t = computeInvoiceTotals({
      items: [{ quantity: 1, unitPrice: 500, taxRate: 0 }],
      taxRate: 18,
    });
    assert.equal(n(t.taxAmount), 0);
    assert.equal(n(t.lines[0].taxRate), 0);
  });

  test('lines with no rate of their own take the invoice-level fallback', () => {
    const t = computeInvoiceTotals({
      items: [
        { quantity: 1, unitPrice: 1000 },
        { quantity: 1, unitPrice: 1000, taxRate: 5 },
      ],
      taxRate: 12,
    });
    assert.equal(n(t.lines[0].taxRate), 12);
    assert.equal(n(t.lines[1].taxRate), 5);
    assert.equal(n(t.taxAmount), 120 + 50);
  });

  test('the GST split always reconstructs the tax exactly (odd paise on SGST)', () => {
    // 18% of an odd taxable value produces an odd tax; the half-paisa must
    // land somewhere deterministic and still sum back to the total.
    const t = computeInvoiceTotals({
      items: [{ quantity: 1, unitPrice: 10.11, taxRate: 18 }],
    });
    const split = n(t.cgstAmount) + n(t.sgstAmount) + n(t.igstAmount);
    assert.equal(Math.round(split * 100), Math.round(n(t.taxAmount) * 100));
    assert.equal(n(t.igstAmount), 0);
  });

  test('inter-state invoices carry IGST at the full rate, no CGST/SGST', () => {
    const t = computeInvoiceTotals({
      items: [{ quantity: 1, unitPrice: 1000, taxRate: 18 }],
      taxType: 'IGST',
    });
    assert.equal(t.taxType, 'IGST');
    assert.equal(n(t.igstAmount), 180);
    assert.equal(n(t.cgstAmount), 0);
    assert.equal(n(t.sgstAmount), 0);
  });
});

describe('computeInvoiceTotals — discounts', () => {
  test('percent discount allocates across lines so the shares sum exactly', () => {
    const t = computeInvoiceTotals({
      items: [
        { quantity: 1, unitPrice: 333.33 },
        { quantity: 1, unitPrice: 333.33 },
        { quantity: 1, unitPrice: 333.34 },
      ],
      discountType: 'percent',
      discountValue: 10,
      taxRate: 18,
    });
    const shares = t.lines.reduce((acc, l) => acc + n(l.discountAmount), 0);
    assert.equal(Math.round(shares * 100), Math.round(n(t.discountAmount) * 100));
    // Taxable value on the lines sums to the invoice taxable value.
    const taxable = t.lines.reduce((acc, l) => acc + n(l.taxableValue), 0);
    assert.equal(Math.round(taxable * 100), Math.round(n(t.taxableAmount) * 100));
  });

  test('flat discount is clamped to the subtotal; percent is clamped to 100', () => {
    const flat = computeInvoiceTotals({
      items: [{ quantity: 1, unitPrice: 500 }],
      discountType: 'flat',
      discountValue: 9999,
    });
    assert.equal(n(flat.discountAmount), 500);

    const pct = computeInvoiceTotals({
      items: [{ quantity: 1, unitPrice: 500 }],
      discountType: 'percent',
      discountValue: 150,
    });
    assert.equal(n(pct.discountAmount), 500);
    assert.equal(n(pct.grandTotal), 0);
  });

  test('shipping lands in the grand total but never in the taxable base', () => {
    const t = computeInvoiceTotals({
      items: [{ quantity: 1, unitPrice: 100, taxRate: 18 }],
      shippingCharges: 49.5,
    });
    assert.equal(n(t.taxableAmount), 100);
    assert.equal(n(t.taxAmount), 18);
    assert.equal(n(t.grandTotal), 167.5);
  });
});

describe('computeInvoiceTotals — guards', () => {
  test('zero / negative quantity and negative price are rejected with field keys', () => {
    assert.throws(
      () => computeInvoiceTotals({ items: [{ quantity: 0, unitPrice: 10 }] }),
      (err) => err instanceof BillingError && Boolean(err.details['items.0.quantity'])
    );
    assert.throws(
      () => computeInvoiceTotals({ items: [{ quantity: 1, unitPrice: -5 }] }),
      (err) => err instanceof BillingError && Boolean(err.details['items.0.unitPrice'])
    );
  });
});

// ---------------------------------------------------------------------------
// Credit notes
// ---------------------------------------------------------------------------

/** Build an invoice, then turn its lines into "stored invoice items". */
function invoiceWithLines(overrides = {}) {
  const t = computeInvoiceTotals({
    items: [
      { quantity: 4, unitPrice: 3850, taxRate: 18 },
      { quantity: 2, unitPrice: 1950, taxRate: 12 },
    ],
    discountType: 'percent',
    discountValue: 5,
    taxRate: 18,
    shippingCharges: 100,
    ...overrides,
  });
  const stored = t.lines.map((line, i) => ({
    invoiceItemId: i + 1,
    productId: i + 1,
    productName: line.productName || `Product ${i + 1}`,
    sku: line.sku || `SKU-${i + 1}`,
    unit: line.unit,
    hsnCode: '4001',
    invoicedQuantity: line.quantity,
    creditedQuantity: line.quantity, // full credit unless overridden
    unitPrice: line.unitPrice,
    lineDiscountAmount: line.discountAmount,
    taxRate: line.taxRate,
  }));
  return { invoice: t, stored };
}

describe('computeCreditNoteTotals', () => {
  test('a FULL credit reproduces the invoice totals exactly (shipping excluded)', () => {
    const { invoice, stored } = invoiceWithLines();
    const credit = computeCreditNoteTotals({ items: stored, taxType: invoice.taxType });

    assert.equal(n(credit.subtotal), n(invoice.subtotal));
    assert.equal(n(credit.discountAmount), n(invoice.discountAmount));
    assert.equal(n(credit.taxableAmount), n(invoice.taxableAmount));
    assert.equal(n(credit.taxAmount), n(invoice.taxAmount));
    assert.equal(n(credit.cgstAmount), n(invoice.cgstAmount));
    assert.equal(n(credit.sgstAmount), n(invoice.sgstAmount));
    assert.equal(n(credit.igstAmount), n(invoice.igstAmount));
    // A return does not re-charge freight: the credit covers the goods + tax.
    assert.equal(n(credit.grandTotal), n(invoice.grandTotal) - n(invoice.shippingCharges));
    assert.equal(credit.totalItems, invoice.totalItems);
    // Every line keeps its own slab.
    assert.equal(n(credit.lines[0].taxRate), 18);
    assert.equal(n(credit.lines[1].taxRate), 12);
  });

  test('a partial credit scales the line and its discount share proportionally', () => {
    const { stored } = invoiceWithLines();
    stored[0].creditedQuantity = 1; // 1 of 4 units
    const credit = computeCreditNoteTotals({ items: [stored[0]] });

    const line = credit.lines[0];
    assert.equal(line.quantity, 1);
    // 1/4 of the line amount: 3850, and 1/4 of its invoice discount share.
    assert.equal(n(line.lineAmount), 3850);
    assert.equal(n(line.discountAmount), n(stored[0].lineDiscountAmount) / 4);
    assert.equal(n(line.taxRate), 18);
    assert.equal(n(credit.taxAmount), n(line.lineTax));
    assert.equal(n(credit.grandTotal), n(credit.taxableAmount) + n(credit.taxAmount));
  });

  test('rejects crediting more units than were invoiced', () => {
    const { stored } = invoiceWithLines();
    stored[0].creditedQuantity = 5; // only 4 invoiced
    assert.throws(
      () => computeCreditNoteTotals({ items: [stored[0]] }),
      (err) =>
        err instanceof BillingError &&
        err.details['items.0.quantity'].includes('At most 4')
    );
  });

  test('rejects a zero credit quantity', () => {
    const { stored } = invoiceWithLines();
    stored[0].creditedQuantity = 0;
    assert.throws(
      () => computeCreditNoteTotals({ items: [stored[0]] }),
      (err) => err instanceof BillingError && Boolean(err.details['items.0.quantity'])
    );
  });

  test('inter-state credit notes carry IGST, not a CGST/SGST split', () => {
    const { invoice, stored } = invoiceWithLines({ taxType: 'IGST' });
    const credit = computeCreditNoteTotals({ items: stored, taxType: invoice.taxType });
    assert.equal(credit.taxType, 'IGST');
    assert.equal(n(credit.igstAmount), n(credit.taxAmount));
    assert.equal(n(credit.cgstAmount), 0);
    assert.equal(n(credit.sgstAmount), 0);
    assert.equal(n(credit.igstAmount), n(invoice.igstAmount));
  });

  test('split invariant holds on the credit too', () => {
    const { invoice, stored } = invoiceWithLines();
    const credit = computeCreditNoteTotals({ items: stored, taxType: invoice.taxType });
    const split = n(credit.cgstAmount) + n(credit.sgstAmount) + n(credit.igstAmount);
    assert.equal(Math.round(split * 100), Math.round(n(credit.taxAmount) * 100));
  });
});

describe('resolveSettlementState — credits count as settled value', () => {
  const grandTotal = 1000;

  test('no payment, no credit -> fully pending', () => {
    const s = resolveSettlementState({ grandTotal, paidAmount: 0, creditedAmount: 0 });
    assert.equal(n(s.balanceDue), 1000);
    assert.equal(s.paymentStatus, 'PENDING');
  });

  test('a credit note reduces the balance without any cash moving', () => {
    const s = resolveSettlementState({ grandTotal, paidAmount: 0, creditedAmount: 400 });
    assert.equal(n(s.balanceDue), 600);
    assert.equal(s.paymentStatus, 'PARTIAL');
  });

  test('paid + credited >= total settles the invoice', () => {
    const s = resolveSettlementState({ grandTotal, paidAmount: 700, creditedAmount: 300 });
    assert.equal(n(s.balanceDue), 0);
    assert.equal(s.paymentStatus, 'PAID');
  });

  test('the legacy two-argument view still drives resolvePaymentStatusEnum', () => {
    assert.equal(resolvePaymentStatusEnum(1000, 0), 'PENDING');
    assert.equal(resolvePaymentStatusEnum(1000, 500), 'PARTIAL');
    assert.equal(resolvePaymentStatusEnum(1000, 1000), 'PAID');
  });
});
