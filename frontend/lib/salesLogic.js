// Business logic for sales calculations (kept separate from presentation)

/**
 * Round to 2 decimal places to avoid floating point drift in currency
 */
export function round2(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

/**
 * Calculate the complete billing summary for a sale
 *
 * Formula:
 *   lineAmount          = quantity * unitPrice
 *   subtotal            = sum(lineAmount)
 *   discountAmount      = discountType === 'percent' ? subtotal * percent/100 : flat amount
 *   taxableAmount       = subtotal - discountAmount
 *   taxAmount           = taxableAmount * taxRate / 100
 *   grandTotal          = taxableAmount + taxAmount
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
    return { ...item, quantity, unitPrice, lineAmount };
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
  const taxAmount = round2((taxableAmount * numericTaxRate) / 100);
  const shipping = round2(Number(shippingCharges || 0));
  const grandTotal = round2(taxableAmount + taxAmount + shipping);

  return {
    lineItems,
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