import Decimal from 'decimal.js';
import { allocate, d, money, sum, ZERO } from './decimal.js';

/**
 * Authoritative billing engine.
 *
 * This is the single source of truth for every amount on an invoice. It is a
 * pure function of (products, quantities, unit prices, discount, tax rate,
 * shipping) — it never reads anything the client claims, and it produces output
 * byte-identical to frontend/lib/salesLogic.js#calculateSaleTotals.
 *
 * Formula (fixed by the frontend and mirrored exactly):
 *
 *   lineAmount      = quantity x unitPrice
 *   subtotal        = SUM(lineAmount)
 *   discountAmount  = percent -> subtotal * clamp(percent, 0, 100) / 100
 *                   = flat    -> clamp(value, 0, subtotal)
 *   taxableAmount   = subtotal - discountAmount
 *   taxAmount       = taxableAmount * taxRate / 100
 *   grandTotal      = taxableAmount + taxAmount + shippingCharges
 */

/**
 * @param {object} input
 * @param {Array<{productId?:string, quantity:number, unitPrice:number}>} input.items
 *   Client-supplied `subtotal` / `lineTotal` fields are intentionally ignored.
 * @param {'percent'|'flat'} input.discountType
 * @param {number} input.discountValue
 * @param {number} input.taxRate
 * @param {number} input.shippingCharges
 * @param {'CGST_SGST'|'IGST'} input.taxType
 * @param {Array<object>} input.resolvedProducts
 *   Products already read from the DB (used for the frozen name/sku/unit
 *   snapshots). Must be aligned index-for-index with `items`.
 */
export function computeInvoiceTotals({
  items = [],
  discountType = 'percent',
  discountValue = 0,
  taxRate = 18,
  shippingCharges = 0,
  taxType = 'CGST_SGST',
  resolvedProducts = [],
}) {
  // ---- 1. line amounts -----------------------------------------------------
  const lines = items.map((item, index) => {
    const product = resolvedProducts[index] ?? null;
    const quantity = d(item.quantity).toDecimalPlaces(0, Decimal.ROUND_DOWN);
    const unitPrice = money(item.unitPrice);

    if (quantity.lessThanOrEqualTo(0)) {
      throw new BillingError(`Quantity must be greater than 0`, {
        [`items.${index}.quantity`]: 'Must be greater than 0',
      });
    }
    if (unitPrice.isNegative()) {
      throw new BillingError('Unit price cannot be negative', {
        [`items.${index}.unitPrice`]: 'Must be zero or greater',
      });
    }

    return {
      product,
      productId: product ? product.id : item.productId ?? null,
      productName: product?.name ?? item.productName ?? '',
      sku: product?.sku ?? item.sku ?? '',
      unit: product?.unit ?? item.unit ?? 'pcs',
      hsnCode: product?.hsnCode ?? null,
      quantity: Number(quantity),
      unitPrice,
      lineAmount: money(quantity.mul(unitPrice)),
      sortOrder: index,
    };
  });

  // ---- 2. subtotal ---------------------------------------------------------
  const subtotal = money(sum(lines.map((l) => l.lineAmount)));

  // ---- 3. discount ---------------------------------------------------------
  const rawDiscount = d(discountValue);
  let discountAmount;
  if (discountType === 'flat') {
    discountAmount = money(
      Decimal.min(Decimal.max(rawDiscount, ZERO), subtotal)
    );
  } else {
    const pct = Decimal.min(Decimal.max(rawDiscount, ZERO), new Decimal(100));
    discountAmount = money(subtotal.mul(pct).div(100));
  }

  // Resolved percentage, used by the frontend's `discountPercent` display field.
  const discountPercent = subtotal.isZero()
    ? money(0)
    : money(discountAmount.mul(100).div(subtotal));

  // ---- 4. taxable + tax ----------------------------------------------------
  const taxableAmount = money(subtotal.minus(discountAmount));
  const rate = d(taxRate);
  const taxAmount = money(taxableAmount.mul(rate).div(100));

  // ---- 5. allocate the discount across lines, exactly ----------------------
  // Each line's discount is a proportional share of the invoice discount, and
  // the shares sum to discountAmount to the paisa.
  const lineAmounts = lines.map((l) => l.lineAmount);
  const lineDiscounts = allocate(discountAmount, lineAmounts);
  const lineTaxables = lineDiscounts.map((disc, i) => money(lineAmounts[i].minus(disc)));

  // ---- 6. allocate invoice-level tax across lines, exactly ------------------
  // Distributing the *already-rounded* invoice tax (rather than recomputing tax
  // per line) guarantees the line totals add up to the invoice tax exactly.
  const lineTaxes = allocate(taxAmount, lineTaxables);

  const isInterState = taxType === 'IGST';

  const finalLines = lines.map((line, i) => {
    const lineTax = lineTaxes[i];

    // Split tax: intra-state is CGST + SGST at half the rate each; inter-state
    // is IGST at the full rate. The odd paisa (when the rate is odd) lands on
    // SGST so cgst + sgst === igst-free tax exactly.
    let cgst = ZERO;
    let sgst = ZERO;
    let igst = ZERO;

    if (isInterState) {
      igst = lineTax;
    } else {
      cgst = lineTax.div(2).toDecimalPlaces(2, Decimal.ROUND_DOWN);
      sgst = money(lineTax.minus(cgst));
    }

    return {
      ...line,
      discountAmount: money(lineDiscounts[i]),
      taxableValue: lineTaxables[i],
      cgstAmount: money(cgst),
      sgstAmount: money(sgst),
      igstAmount: money(igst),
      // line_total is the taxable value; tax is shown separately as CGST/SGST/IGST
      // which is how a GST invoice is conventionally laid out.
      lineTotal: lineTaxables[i],
    };
  });

  // ---- 7. invoice-level tax split -----------------------------------------
  const totalCgst = money(sum(finalLines.map((l) => l.cgstAmount)));
  const totalSgst = money(sum(finalLines.map((l) => l.sgstAmount)));
  const totalIgst = money(sum(finalLines.map((l) => l.igstAmount)));

  // Reconcile: the line-level split must reconstruct the invoice tax exactly.
  const splitTotal = money(totalCgst.plus(totalSgst).plus(totalIgst));
  if (!splitTotal.equals(taxAmount)) {
    // Should be unreachable; fail loudly rather than ship a mismatched invoice.
    throw new BillingError(
      `Internal error: GST split ${splitTotal} does not match tax ${taxAmount}`
    );
  }

  const shipping = money(shippingCharges);
  const grandTotal = money(taxableAmount.plus(taxAmount).plus(shipping));

  return {
    lines: finalLines,
    subtotal,
    discountType,
    discountValue: money(rawDiscount),
    discountAmount,
    discountPercent,
    taxableAmount,
    taxRate: rate,
    taxType: isInterState ? 'IGST' : 'CGST_SGST',
    taxAmount,
    cgstAmount: totalCgst,
    sgstAmount: totalSgst,
    igstAmount: totalIgst,
    shippingCharges: shipping,
    grandTotal,
    totalItems: finalLines.reduce((acc, l) => acc + l.quantity, 0),
  };
}

/**
 * Determine the persisted payment status from money in / money out.
 * `Overdue` is deliberately absent: it is a function of the due date and is
 * derived at read time (see lib/enums.js#toPaymentStatusLabel).
 */
export function resolvePaymentStatusEnum(grandTotal, paidAmount) {
  const total = money(grandTotal);
  const paid = money(paidAmount);

  if (paid.lessThanOrEqualTo(0)) return 'PENDING';
  if (paid.greaterThanOrEqualTo(total)) return 'PAID';
  return 'PARTIAL';
}

/** Balance = what is still owed, never negative. */
export function computeBalanceDue(grandTotal, paidAmount) {
  return money(Decimal.max(money(grandTotal).minus(money(paidAmount)), ZERO));
}

export class BillingError extends Error {
  constructor(message, details) {
    super(message);
    this.name = 'BillingError';
    this.details = details;
  }
}