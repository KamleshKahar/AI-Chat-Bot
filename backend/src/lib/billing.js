import Decimal from 'decimal.js';
import { allocate, d, money, sum, ZERO } from './decimal.js';

/**
 * Authoritative billing engine.
 *
 * This is the single source of truth for every amount on an invoice. It is a
 * pure function of (products, quantities, unit prices, discount, per-line GST
 * slabs, shipping) — it never reads anything the client claims, and it
 * produces output byte-identical to frontend/lib/salesLogic.js#calculateSaleTotals.
 *
 * Formula (fixed by the frontend and mirrored exactly):
 *
 *   lineAmount      = quantity x unitPrice
 *   subtotal        = SUM(lineAmount)
 *   discountAmount  = percent -> subtotal * clamp(percent, 0, 100) / 100
 *                   = flat    -> clamp(value, 0, subtotal)
 *   lineDiscount    = the line's proportional share of discountAmount
 *   lineTaxable     = lineAmount - lineDiscount
 *   lineTax         = lineTaxable x lineTaxRate / 100   (each line's own slab)
 *   taxAmount       = SUM(lineTax)
 *   taxableAmount   = subtotal - discountAmount
 *   grandTotal      = taxableAmount + taxAmount + shippingCharges
 *
 * Tax is deliberately computed *per line*: an invoice may combine a 12% line
 * with an 18% line, so there is no single invoice rate to apply. The invoice's
 * `taxRate` column is only the fallback for lines that carry no rate of
 * their own.
 */

/**
 * @param {object} input
 * @param {Array<{productId?:string, quantity:number, unitPrice:number, taxRate?:number}>} input.items
 *   Client-supplied `subtotal` / `lineTotal` fields are intentionally ignored.
 *   `taxRate` is the line's GST slab; when omitted the line falls back to the
 *   invoice-level `taxRate`.
 * @param {'percent'|'flat'} input.discountType
 * @param {number} input.discountValue
 * @param {number} input.taxRate invoice-level fallback rate
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
      // The line's GST slab. `?? taxRate` keeps 0% (a valid slab) intact and
      // only falls back when no rate was supplied at all.
      taxRate: d(item.taxRate ?? taxRate),
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

  // ---- 4. taxable ----------------------------------------------------------
  const taxableAmount = money(subtotal.minus(discountAmount));

  // ---- 5. allocate the discount across lines, exactly ----------------------
  // Each line's discount is a proportional share of the invoice discount, and
  // the shares sum to discountAmount to the paisa.
  const lineAmounts = lines.map((l) => l.lineAmount);
  const lineDiscounts = allocate(discountAmount, lineAmounts);
  const lineTaxables = lineDiscounts.map((disc, i) => money(lineAmounts[i].minus(disc)));

  // ---- 6. tax per line, at that line's own GST slab ------------------------
  // Each line is rounded independently; the invoice tax is the SUM of those
  // parts rather than a rounding of a single invoice-level figure — on a
  // mixed-rate invoice the latter does not even exist. The parts are exact by
  // construction: cgst + sgst + igst of every line add up to lineTaxes, and
  // lineTaxes add up to taxAmount.
  const lineTaxes = lineTaxables.map((taxable, i) =>
    money(taxable.mul(lines[i].taxRate).div(100))
  );
  const taxAmount = money(sum(lineTaxes));

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
    // The invoice-level fallback rate (what the header persists). On a
    // mixed-rate invoice the authoritative per-line rates live on `lines`.
    taxRate: d(taxRate),
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
 * Authoritative credit-note totals.
 *
 * A credit note never re-prices anything: it returns part of an invoice that
 * was already priced, discounted and taxed. Each credited line therefore takes
 * its unit price, GST slab and share of the original line discount straight
 * from the STORED invoice item — the payload can only say *how many* units are
 * coming back. Crediting every unit of every line reproduces the invoice's own
 * figures to the paisa, so a fully-credited invoice nets to exactly zero.
 *
 * Per line:
 *   lineAmount    = creditedQuantity x unitPrice
 *   lineDiscount  = original line discount x creditedQuantity / invoicedQuantity
 *   lineTaxable   = lineAmount - lineDiscount
 *   lineTax       = lineTaxable x taxRate / 100
 *
 * Invoice level: every total is the sum of its parts. There is no shipping —
 * a return does not re-charge freight — and no invoice-level discount of its
 * own (it is already inside the per-line shares).
 *
 * @param {object} input
 * @param {Array<object>} input.items stored invoice items + credited quantities
 * @param {'CGST_SGST'|'IGST'} input.taxType copied from the invoice
 */
export function computeCreditNoteTotals({ items = [], taxType = 'CGST_SGST' }) {
  const lines = items.map((item, index) => {
    const invoiced = d(item.invoicedQuantity).toDecimalPlaces(0, Decimal.ROUND_DOWN);
    const credited = d(item.creditedQuantity).toDecimalPlaces(0, Decimal.ROUND_DOWN);
    const unitPrice = money(item.unitPrice);

    if (invoiced.lessThanOrEqualTo(0)) {
      throw new BillingError(`Invoiced quantity must be greater than 0`, {
        [`items.${index}.quantity`]: 'Invalid invoice line',
      });
    }
    if (credited.lessThanOrEqualTo(0)) {
      throw new BillingError(`Quantity must be greater than 0`, {
        [`items.${index}.quantity`]: 'Must be greater than 0',
      });
    }
    if (credited.greaterThan(invoiced)) {
      throw new BillingError(`Quantity exceeds the invoiced amount`, {
        [`items.${index}.quantity`]: `At most ${invoiced} unit(s) were invoiced on this line`,
      });
    }
    if (unitPrice.isNegative()) {
      throw new BillingError('Unit price cannot be negative', {
        [`items.${index}.unitPrice`]: 'Must be zero or greater',
      });
    }

    const lineAmount = money(credited.mul(unitPrice));
    const discountAmount = money(
      d(item.lineDiscountAmount).mul(credited).div(invoiced)
    );
    const taxableValue = money(lineAmount.minus(discountAmount));
    const rate = d(item.taxRate);
    const lineTax = money(taxableValue.mul(rate).div(100));

    const isInterState = taxType === 'IGST';
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
      invoiceItemId: item.invoiceItemId ?? null,
      productId: item.productId ?? null,
      productName: item.productName ?? '',
      sku: item.sku ?? '',
      unit: item.unit ?? 'pcs',
      hsnCode: item.hsnCode ?? null,
      quantity: Number(credited),
      invoicedQuantity: Number(invoiced),
      unitPrice,
      lineAmount,
      discountAmount,
      taxableValue,
      taxRate: rate,
      // Tax before the CGST/SGST/IGST split — kept so the invoice-level
      // taxAmount can be summed from the very figure the split was derived from.
      lineTax,
      cgstAmount: money(cgst),
      sgstAmount: money(sgst),
      igstAmount: money(igst),
      // line_total is the taxable value — same convention as invoice lines.
      lineTotal: taxableValue,
      sortOrder: index,
    };
  });

  const subtotal = money(sum(lines.map((l) => l.lineAmount)));
  const discountAmount = money(sum(lines.map((l) => l.discountAmount)));
  const taxableAmount = money(sum(lines.map((l) => l.taxableValue)));
  const taxAmount = money(sum(lines.map((l) => l.lineTax)));

  const totalCgst = money(sum(lines.map((l) => l.cgstAmount)));
  const totalSgst = money(sum(lines.map((l) => l.sgstAmount)));
  const totalIgst = money(sum(lines.map((l) => l.igstAmount)));
  const splitTotal = money(totalCgst.plus(totalSgst).plus(totalIgst));
  if (!splitTotal.equals(taxAmount)) {
    throw new BillingError(
      `Internal error: GST split ${splitTotal} does not match tax ${taxAmount}`
    );
  }

  return {
    lines,
    subtotal,
    discountAmount,
    taxableAmount,
    taxType: taxType === 'IGST' ? 'IGST' : 'CGST_SGST',
    taxAmount,
    cgstAmount: totalCgst,
    sgstAmount: totalSgst,
    igstAmount: totalIgst,
    grandTotal: money(taxableAmount.plus(taxAmount)),
    totalItems: lines.reduce((acc, l) => acc + l.quantity, 0),
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

/**
 * The stored money triad of an invoice, once credit notes count as settled
 * value.
 *
 * A credit note does not move cash, but it does extinguish part of the
 * receivable: ₹1,000 invoiced with a ₹400 credit note leaves ₹600 still owed
 * even though nothing was ever paid. `balanceDue` and `paymentStatus` are
 * therefore a function of (grandTotal, paidAmount + creditedAmount).
 *
 * @param {object} invoice
 * @param {Decimal|number|string} invoice.grandTotal
 * @param {Decimal|number|string} invoice.paidAmount
 * @param {Decimal|number|string} [invoice.creditedAmount]
 * @returns {{balanceDue: Decimal, paymentStatus: 'PENDING'|'PARTIAL'|'PAID'}}
 */
export function resolveSettlementState({ grandTotal, paidAmount, creditedAmount = 0 }) {
  const settled = money(d(paidAmount).plus(d(creditedAmount)));
  return {
    balanceDue: computeBalanceDue(grandTotal, settled),
    paymentStatus: resolvePaymentStatusEnum(grandTotal, settled),
  };
}

export class BillingError extends Error {
  constructor(message, details) {
    super(message);
    this.name = 'BillingError';
    this.details = details;
  }
}