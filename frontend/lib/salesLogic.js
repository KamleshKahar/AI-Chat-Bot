// Business logic for sales calculations (kept separate from presentation)

/**
 * Round to 2 decimal places to avoid floating point drift in currency
 */
export function round2(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

/**
 * Split `total` across `weights` so the parts sum to exactly `total`.
 *
 * Largest-remainder method, mirroring backend/src/lib/decimal.js#allocate:
 * each part gets its share truncated to 2dp, then the leftover paise are
 * handed out one at a time to the parts with the largest fractional
 * remainder. Without this, independently-rounded line shares drift a few
 * paise away from the invoice total — exactly the kind of drift a GST audit
 * notices (and the server would then disagree with this preview by a paisa).
 *
 * The `+ 1e-9` fudge inside the floor absorbs binary floating point error
 * (e.g. 0.07 * 100 === 7.000000000000001) so a mathematically exact share
 * is never floored a paisa short.
 */
export function allocate(total, weights) {
  const target = round2(total);
  const n = weights.length;
  if (n === 0) return [];

  const totalWeight = weights.reduce((acc, w) => acc + Number(w || 0), 0);
  if (totalWeight === 0) return weights.map((_, i) => (i === 0 ? target : 0));

  const exact = weights.map((w) => (target * Number(w)) / totalWeight);
  const floored = exact.map((v) => Math.floor(v * 100 + 1e-9) / 100);

  const assigned = round2(floored.reduce((acc, v) => acc + v, 0));
  let leftover = Math.round((target - assigned) * 100); // whole paise

  const order = exact
    .map((v, i) => ({ i, frac: v - floored[i] }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);

  const result = floored.slice();
  let cursor = 0;
  while (leftover > 0 && order.length > 0) {
    result[order[cursor % order.length].i] = round2(result[order[cursor % order.length].i] + 0.01);
    leftover -= 1;
    cursor += 1;
  }
  return result;
}

/**
 * Calculate the complete billing summary for a sale
 *
 * Formula (mirrors backend/src/lib/billing.js#computeInvoiceTotals exactly):
 *   lineAmount          = quantity * unitPrice
 *   subtotal            = sum(lineAmount)
 *   discountAmount      = discountType === 'percent' ? subtotal * percent/100 : flat amount
 *   lineDiscount        = the line's proportional share of discountAmount
 *   lineTaxable         = lineAmount - lineDiscount
 *   lineTax             = lineTaxable * lineTaxRate / 100   (each line's OWN slab)
 *   taxAmount           = sum(lineTax)
 *   taxableAmount       = subtotal - discountAmount
 *   grandTotal          = taxableAmount + taxAmount + shippingCharges
 *
 * Tax is per line because an invoice may mix slabs (12% + 18%); the
 * invoice-level `taxRate` is only the fallback for lines without a rate.
 */
export function calculateSaleTotals({
  items = [],
  discountType = 'percent',
  discountValue = 0,
  taxRate = 18,
  shippingCharges = 0,
}) {
  const lineItems = items.map((item) => {
    const quantity = Number(item.quantity || 0);
    const unitPrice = Number(item.unitPrice || 0);
    const lineAmount = round2(quantity * unitPrice);
    // Per-line GST slab. `??` keeps an explicit 0% (a valid slab) intact and
    // falls back only when no rate was supplied at all.
    const lineRate = Number(item.taxRate ?? taxRate ?? 0);
    return { ...item, quantity, unitPrice, lineAmount, taxRate: lineRate };
  });

  const subtotal = round2(lineItems.reduce((acc, item) => acc + item.lineAmount, 0));

  const numericDiscount = Number(discountValue || 0);
  let discountAmount = 0;

  if (discountType === 'percent') {
    discountAmount = round2((subtotal * Math.min(Math.max(numericDiscount, 0), 100)) / 100);
  } else {
    discountAmount = round2(Math.min(Math.max(numericDiscount, 0), subtotal));
  }

  const taxableAmount = round2(subtotal - discountAmount);
  const numericTaxRate = Number(taxRate || 0);

  // Allocate the invoice discount across lines, then tax each line at its own
  // slab on its discounted (taxable) value.
  const lineDiscounts = allocate(discountAmount, lineItems.map((i) => i.lineAmount));
  const lineTaxes = lineItems.map((item, i) => {
    const lineTaxable = round2(item.lineAmount - lineDiscounts[i]);
    return round2((lineTaxable * item.taxRate) / 100);
  });
  const taxAmount = round2(lineTaxes.reduce((acc, t) => acc + t, 0));

  const shipping = round2(Number(shippingCharges || 0));
  const grandTotal = round2(taxableAmount + taxAmount + shipping);

  const enriched = lineItems.map((item, i) => ({
    ...item,
    discountAmount: lineDiscounts[i],
    taxableValue: round2(item.lineAmount - lineDiscounts[i]),
    taxAmount: lineTaxes[i],
  }));

  return {
    lineItems: enriched,
    subtotal,
    discountType,
    discountValue: numericDiscount,
    discountAmount,
    taxableAmount,
    taxRate: numericTaxRate,
    taxAmount,
    shippingCharges: shipping,
    grandTotal,
    totalItems: lineItems.reduce((acc, item) => acc + item.quantity, 0),
  };
}

/**
 * Preview the money a credit note would return for the given invoice lines.
 *
 * Mirrors backend/src/lib/billing.js#computeCreditNoteTotals: a credit note
 * never re-prices anything — unit price, GST slab and share of the original
 * line discount all come from the STORED invoice line, so the payload can
 * only say how many units are coming back. Crediting every unit reproduces
 * the invoice's own totals (except shipping, which a return does not
 * re-charge). The server recomputes authoritatively; this is the live
 * preview shown while picking quantities.
 *
 * @param {Array<object>} items invoice items (quantity, unitPrice,
 *   discountAmount, taxRate) each with `creditedQuantity` (0 = not credited)
 * @param {'CGST_SGST'|'IGST'} taxType copied from the invoice
 */
export function computeCreditNoteTotals({ items = [], taxType = 'CGST_SGST' }) {
  const isInterState = taxType === 'IGST';

  const lines = items
    .map((item) => {
      const invoiced = Number(item.quantity || 0);
      const credited = Number(item.creditedQuantity || 0);
      if (credited <= 0) return null;

      const unitPrice = Number(item.unitPrice || 0);
      const rate = Number(item.taxRate || 0);
      const lineAmount = round2(credited * unitPrice);
      const discountAmount = invoiced > 0
        ? round2((Number(item.discountAmount || 0) * credited) / invoiced)
        : 0;
      const taxableValue = round2(lineAmount - discountAmount);
      const lineTax = round2((taxableValue * rate) / 100);

      const cgst = isInterState ? 0 : Math.floor((lineTax / 2) * 100 + 1e-9) / 100;
      const sgst = isInterState ? 0 : round2(lineTax - cgst);
      const igst = isInterState ? lineTax : 0;

      return {
        invoiceItemId: item.id ?? item.invoiceItemId ?? null,
        productName: item.productName ?? item.name ?? '',
        sku: item.sku ?? '',
        hsnCode: item.hsnCode ?? null,
        quantity: credited,
        invoicedQuantity: invoiced,
        unitPrice: round2(unitPrice),
        lineAmount,
        discountAmount,
        taxableValue,
        taxRate: rate,
        lineTax,
        cgstAmount: cgst,
        sgstAmount: sgst,
        igstAmount: igst,
        lineTotal: taxableValue,
      };
    })
    .filter(Boolean);

  const sum = (fn) => round2(lines.reduce((acc, l) => acc + fn(l), 0));
  const taxableAmount = sum((l) => l.taxableValue);
  const taxAmount = sum((l) => l.lineTax);

  return {
    lines,
    subtotal: sum((l) => l.lineAmount),
    discountAmount: sum((l) => l.discountAmount),
    taxableAmount,
    taxType: isInterState ? 'IGST' : 'CGST_SGST',
    taxAmount,
    cgstAmount: sum((l) => l.cgstAmount),
    sgstAmount: sum((l) => l.sgstAmount),
    igstAmount: sum((l) => l.igstAmount),
    grandTotal: round2(taxableAmount + taxAmount),
    totalItems: lines.reduce((acc, l) => acc + l.quantity, 0),
  };
}

/**
 * Determine payment status from amounts paid vs total
 */
export function resolvePaymentStatus(grandTotal, paidAmount) {
  const total = Number(grandTotal || 0);
  const paid = Number(paidAmount || 0);

  if (paid <= 0) return 'Pending';
  if (round2(paid) >= round2(total)) return 'Paid';
  return 'Partial';
}

/**
 * Compute product performance metrics for reports
 */
export function computeProductPerformance(products, sales) {
  return products
    .map((product) => {
      let unitsSold = 0;
      let revenue = 0;

      sales.forEach((sale) => {
        (sale.items || []).forEach((item) => {
          if (item.productId === product.id) {
            unitsSold += Number(item.quantity || 0);
            revenue += Number(item.subtotal || 0);
          }
        });
      });

      const profit = revenue - unitsSold * Number(product.costPrice || 0);

      return {
        ...product,
        unitsSold,
        revenue: round2(revenue),
        profit: round2(profit),
        marginPercent: revenue > 0 ? Math.round((profit / revenue) * 100) : 0,
        stockValue: round2(Number(product.stockQuantity || 0) * Number(product.costPrice || 0)),
      };
    })
    .sort((a, b) => b.revenue - a.revenue);
}

/**
 * Aggregate sales by customer for reports
 */
export function computeCustomerPerformance(customers, sales) {
  return customers
    .map((customer) => {
      const customerSales = sales.filter((s) => s.customerId === customer.id);
      const lifetimeValue = round2(
        customerSales.reduce((acc, s) => acc + Number(s.grandTotal || 0), 0)
      );
      const collected = round2(customerSales.reduce((acc, s) => acc + Number(s.paidAmount || 0), 0));

      return {
        ...customer,
        orders: customerSales.length,
        lifetimeValue,
        collected,
        outstanding: round2(Number(customer.outstandingBalance || 0)),
        avgOrderValue: customerSales.length ? round2(lifetimeValue / customerSales.length) : 0,
      };
    })
    .sort((a, b) => b.lifetimeValue - a.lifetimeValue);
}

/**
 * Build a daily revenue series across the range (zero-filled for empty days)
 */
export function buildRevenueSeries(sales, { from, to }) {
  const start = new Date(`${String(from).slice(0, 10)}T00:00:00`);
  const end = new Date(`${String(to).slice(0, 10)}T00:00:00`);
  const days = [];

  const cursor = new Date(start);
  while (cursor <= end && days.length < 400) {
    days.push(toISO(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return days.map((day) => {
    const daySales = sales.filter((s) => String(s.date).slice(0, 10) === day);
    return {
      date: day,
      revenue: round2(daySales.reduce((acc, s) => acc + Number(s.grandTotal || 0), 0)),
      collected: round2(daySales.reduce((acc, s) => acc + Number(s.paidAmount || 0), 0)),
      orders: daySales.length,
    };
  });
}

function toISO(date) {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60 * 1000).toISOString().split('T')[0];
}

/**
 * Group sales by a period key (month / week / day)
 */
export function groupSalesByPeriod(sales, period = 'month') {
  const buckets = new Map();

  sales.forEach((sale) => {
    const date = new Date(sale.date);
    let key;

    if (period === 'month') {
      key = date.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
    } else if (period === 'week') {
      const weekStart = new Date(date);
      weekStart.setDate(date.getDate() - date.getDay());
      key = weekStart.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
    } else {
      key = date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
    }

    if (!buckets.has(key)) {
      buckets.set(key, { key, revenue: 0, orders: 0, collected: 0 });
    }

    const bucket = buckets.get(key);
    bucket.revenue += Number(sale.grandTotal || 0);
    bucket.collected += Number(sale.paidAmount || 0);
    bucket.orders += 1;
  });

  return Array.from(buckets.values())
    .map((b) => ({
      ...b,
      revenue: round2(b.revenue),
      collected: round2(b.collected),
    }))
    .sort((a, b) => new Date(a.key) - new Date(b.key));
}

/**
 * Aggregate inventory valuation by category
 */
export function computeInventoryByCategory(products) {
  const map = new Map();

  products.forEach((product) => {
    const key = product.category || 'Uncategorised';
    if (!map.has(key)) {
      map.set(key, { category: key, products: 0, units: 0, costValue: 0, retailValue: 0 });
    }
    const bucket = map.get(key);
    bucket.products += 1;
    bucket.units += Number(product.stockQuantity || 0);
    bucket.costValue += Number(product.stockQuantity || 0) * Number(product.costPrice || 0);
    bucket.retailValue += Number(product.stockQuantity || 0) * Number(product.sellingPrice || 0);
  });

  return Array.from(map.values())
    .map((b) => ({
      ...b,
      costValue: round2(b.costValue),
      retailValue: round2(b.retailValue),
    }))
    .sort((a, b) => b.costValue - a.costValue);
}

/**
 * Payment method breakdown for revenue reports
 */
export function computePaymentBreakdown(sales) {
  const map = new Map();

  sales.forEach((sale) => {
    const method = sale.paymentMethod || 'Other';
    if (!map.has(method)) map.set(method, { method, count: 0, amount: 0 });
    const bucket = map.get(method);
    bucket.count += 1;
    bucket.amount += Number(sale.paidAmount || 0);
  });

  return Array.from(map.values())
    .map((b) => ({ ...b, amount: round2(b.amount) }))
    .sort((a, b) => b.amount - a.amount);
}

/**
 * Filter helper that respects a date range.
 * Uses ISO string comparison so timezones never shift the boundary day.
 */
export function filterByDateRange(sales, from, to) {
  if (!from && !to) return sales;
  return sales.filter((sale) => {
    const date = String(sale.date).slice(0, 10);
    if (from && date < String(from).slice(0, 10)) return false;
    if (to && date > String(to).slice(0, 10)) return false;
    return true;
  });
}