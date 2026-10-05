import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma.js';
import { asMoney } from '../lib/decimal.js';

/**
 * Report aggregations.
 *
 * Everything the Reports screen used to compute in the browser via
 * frontend/lib/salesLogic.js now happens in SQL. The function names match the
 * frontend's helpers one-for-one so the refactor stays mechanical:
 *
 *   groupSalesByPeriod          -> revenueTrend
 *   computePaymentBreakdown     -> paymentBreakdown
 *   computeProductPerformance   -> productPerformance
 *   computeCustomerPerformance  -> customerPerformance
 *   computeInventoryByCategory  -> inventoryByCategory
 *
 * `$queryRaw` hands back `DECIMAL` columns as strings, so every monetary field is
 * passed through `asMoney` on the way out. Without it these endpoints answer
 * with strings while `/products` and `/invoices` answer with numbers, leaving the
 * frontend to guess which is which.
 */

const LIVE = Prisma.sql`i.deleted_at IS NULL AND i.status <> 'CANCELLED'`;

function rangeFilter(from, to, alias = Prisma.sql`i`) {
  const clauses = [];
  if (from) clauses.push(Prisma.sql`${alias}.invoice_date >= ${from}`);
  if (to) clauses.push(Prisma.sql`${alias}.invoice_date <= ${to}`);
  return clauses.length ? Prisma.sql`AND ${Prisma.join(clauses, ' AND ')}` : Prisma.sql``;
}

export const reportRepo = {
  /** Headline numbers for a window, plus the immediately preceding window. */
  async salesSummary({ from, to } = {}, db = prisma) {
    const current = await this.salesTotals({ from, to }, db);

    let previous = null;
    if (from && to) {
      // Same-length window immediately before the requested one.
      const fromDate = new Date(`${from}T00:00:00Z`);
      const toDate = new Date(`${to}T00:00:00Z`);
      const span = Math.round((toDate - fromDate) / 86_400_000) + 1;
      const prevTo = new Date(fromDate.getTime() - 86_400_000).toISOString().slice(0, 10);
      const prevFrom = new Date(fromDate.getTime() - span * 86_400_000).toISOString().slice(0, 10);
      previous = await this.salesTotals({ from: prevFrom, to: prevTo }, db);
    }

    return { from: from ?? null, to: to ?? null, current, previous };
  },

  async salesTotals({ from, to } = {}, db = prisma) {
    const [row] = await db.$queryRaw(Prisma.sql`
      SELECT
        COUNT(*)                     AS orders,
        COALESCE(SUM(grand_total), 0) AS sales_value,
        COALESCE(SUM(paid_amount), 0) AS collected,
        COALESCE(SUM(balance_due), 0) AS outstanding,
        COALESCE(SUM(tax_amount), 0)  AS tax_collected,
        COALESCE(SUM(discount_amount), 0) AS discount_given,
        COALESCE(AVG(grand_total), 0) AS avg_order_value
      FROM invoices i
      WHERE ${LIVE} ${rangeFilter(from, to)}
    `);

    const orders = Number(row?.orders ?? 0);
    const salesValue = asMoney(row?.sales_value ?? 0);
    return {
      orders,
      salesValue,
      collected: asMoney(row?.collected ?? 0),
      outstanding: asMoney(row?.outstanding ?? 0),
      taxCollected: asMoney(row?.tax_collected ?? 0),
      discountGiven: asMoney(row?.discount_given ?? 0),
      avgOrderValue: asMoney(row?.avg_order_value ?? 0),
      collectionRate: salesValue > 0 ? asMoney(row.collected ?? 0) / salesValue : 0,
    };
  },

  /**
   * Revenue over time, grouped by day / week / month.
   *
   * `day` granularity is zero-filled into a gapless series, matching
   * frontend/lib/salesLogic.js#buildRevenueSeries — a chart that silently omits
   * quiet days draws a misleading line.
   */
  async revenueTrend({ from, to, granularity = 'day' } = {}, db = prisma) {
    const key =
      granularity === 'month'
        ? Prisma.sql`DATE_FORMAT(i.invoice_date, '%Y-%m-01')`
        : granularity === 'week'
          ? // Week starting Sunday, matching the frontend's `getDay()` grouping.
            Prisma.sql`DATE_FORMAT(DATE_SUB(i.invoice_date, INTERVAL WEEKDAY(i.invoice_date) DAY), '%Y-%m-%d')`
          : Prisma.sql`DATE_FORMAT(i.invoice_date, '%Y-%m-%d')`;

    const rows = await db.$queryRaw(Prisma.sql`
      SELECT
        ${key} AS bucket,
        COUNT(*)                     AS orders,
        COALESCE(SUM(grand_total), 0) AS revenue,
        COALESCE(SUM(paid_amount), 0) AS collected,
        COALESCE(SUM(balance_due), 0) AS outstanding
      FROM invoices i
      WHERE ${LIVE} ${rangeFilter(from, to)}
      GROUP BY bucket
      ORDER BY bucket ASC
    `);

    if (granularity !== 'day') {
      return rows.map((r) => ({
        date: r.bucket,
        label: bucketLabel(r.bucket, granularity),
        revenue: asMoney(r.revenue),
        collected: asMoney(r.collected),
        orders: Number(r.orders),
      }));
    }

    // Zero-fill the daily series across the requested window.
    const byDate = new Map(rows.map((r) => [String(r.bucket), r]));
    const start = from ?? String(rows[0]?.bucket ?? '');
    const end = to ?? String(rows[rows.length - 1]?.bucket ?? start);

    const series = [];
    if (start && end) {
      const cursor = new Date(`${start}T00:00:00Z`);
      const last = new Date(`${end}T00:00:00Z`);
      let guard = 0;
      while (cursor <= last && guard < 1000) {
        const iso = cursor.toISOString().slice(0, 10);
        const row = byDate.get(iso);
        series.push({
          date: iso,
          label: iso,
          revenue: asMoney(row?.revenue ?? 0),
          collected: asMoney(row?.collected ?? 0),
          orders: row ? Number(row.orders) : 0,
        });
        cursor.setUTCDate(cursor.getUTCDate() + 1);
        guard += 1;
      }
    }
    return series;
  },

  /** Collected amount split by payment method. */
  async paymentBreakdown({ from, to } = {}, db = prisma) {
    const rows = await db.$queryRaw(Prisma.sql`
      SELECT
        i.payment_method AS method,
        COUNT(*)                     AS count,
        COALESCE(SUM(i.grand_total), 0) AS invoiced,
        COALESCE(SUM(i.paid_amount), 0) AS amount
      FROM invoices i
      WHERE ${LIVE} ${rangeFilter(from, to)}
      GROUP BY i.payment_method
      ORDER BY amount DESC
    `);
    return rows.map((r) => ({
      method: r.method,
      count: Number(r.count),
      invoiced: asMoney(r.invoiced),
      amount: asMoney(r.amount),
    }));
  },

  /**
   * Per-product sales performance. Revenue is net of the allocated discount
   * (SUM(invoice_items.line_total)), which is a truer figure than the
   * pre-discount line amount the frontend used to read.
   */
  async productPerformance({ from, to } = {}, db = prisma) {
    const filter = rangeFilter(from, to);
    const rows = await db.$queryRaw(Prisma.sql`
      SELECT
        p.id, p.code, p.sku, p.name, p.cost_price, p.selling_price, p.stock_quantity,
        p.tax_rate, p.min_stock_level,
        cat.name AS category_name,
        COALESCE(sold.units_sold, 0)  AS units_sold,
        COALESCE(sold.revenue, 0)     AS revenue,
        (p.stock_quantity * p.cost_price) AS stock_value
      FROM products p
      INNER JOIN categories cat ON cat.id = p.category_id
      LEFT JOIN (
        SELECT
          ii.product_id,
          SUM(ii.quantity)   AS units_sold,
          SUM(ii.line_total) AS revenue
        FROM invoice_items ii
        INNER JOIN invoices i ON i.id = ii.invoice_id
        WHERE ${LIVE} ${filter}
        GROUP BY ii.product_id
      ) sold ON sold.product_id = p.id
      WHERE p.deleted_at IS NULL
      ORDER BY revenue DESC, p.name ASC
    `);

    return rows.map((r) => {
      const units = Number(r.units_sold);
      const revenue = asMoney(r.revenue);
      const cost = asMoney(units * Number(r.cost_price));
      const profit = asMoney(Number(revenue) - Number(cost));
      return {
        id: r.code,
        sku: r.sku,
        name: r.name,
        category: r.category_name,
        costPrice: asMoney(r.cost_price),
        sellingPrice: asMoney(r.selling_price),
        taxRate: Number(r.tax_rate),
        stockQuantity: Number(r.stock_quantity),
        stockValue: asMoney(r.stock_value),
        unitsSold: units,
        revenue,
        cost,
        profit,
        marginPercent: revenue > 0 ? Math.round((profit / revenue) * 100) : 0,
      };
    });
  },

  /** Per-customer lifetime value, collection and average order. */
  async customerPerformance({ from, to } = {}, db = prisma) {
    const filter = rangeFilter(from, to);
    const rows = await db.$queryRaw(Prisma.sql`
      SELECT
        c.id, c.code, c.name, c.company, c.city, c.state, c.status,
        c.opening_balance,
        COALESCE(s.lifetime_value, 0) AS lifetime_value,
        COALESCE(s.collected, 0)     AS collected,
        COALESCE(s.orders, 0)         AS orders
      FROM customers c
      LEFT JOIN (
        SELECT
          customer_id,
          SUM(grand_total) AS lifetime_value,
          SUM(paid_amount) AS collected,
          COUNT(*)         AS orders
        FROM invoices i
        WHERE ${LIVE} ${filter}
        GROUP BY customer_id
      ) s ON s.customer_id = c.id
      WHERE c.deleted_at IS NULL
      ORDER BY lifetime_value DESC, c.name ASC
    `);

    return rows.map((r) => {
      const lifetime = asMoney(r.lifetime_value);
      const orders = Number(r.orders);
      const collected = asMoney(r.collected);
      return {
        id: r.code,
        name: r.name,
        company: r.company,
        city: r.city,
        state: r.state,
        status: r.status,
        orders,
        lifetimeValue: lifetime,
        collected,
        // Opening balance the customer already owed, plus whatever of this
        // window's billing is still unpaid.
        outstanding: asMoney(
          Number(r.opening_balance ?? 0) + (lifetime - collected)
        ),
        avgOrderValue: orders > 0 ? asMoney(lifetime / orders) : 0,
      };
    });
  },

  /** Stock position and valuation grouped by category. */
  async inventoryByCategory(db = prisma) {
    const rows = await db.$queryRaw(Prisma.sql`
      SELECT
        cat.name AS category,
        COUNT(p.id)                                  AS products,
        COALESCE(SUM(p.stock_quantity), 0)           AS units,
        COALESCE(SUM(p.stock_quantity * p.cost_price), 0)    AS cost_value,
        COALESCE(SUM(p.stock_quantity * p.selling_price), 0) AS retail_value
      FROM categories cat
      INNER JOIN products p ON p.category_id = cat.id AND p.deleted_at IS NULL
      WHERE cat.deleted_at IS NULL
      GROUP BY cat.id, cat.name
      ORDER BY cost_value DESC
    `);
    return rows.map((r) => ({
      category: r.category,
      products: Number(r.products),
      units: Number(r.units),
      costValue: asMoney(r.cost_value),
      retailValue: asMoney(r.retail_value),
    }));
  },
};

/** '2026-10-01' -> 'Oct 26' / '01 Oct' depending on granularity. */
function bucketLabel(isoDate, granularity) {
  const date = new Date(`${String(isoDate).slice(0, 10)}T00:00:00Z`);
  const month = date.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' });
  const day = String(date.getUTCDate()).padStart(2, '0');
  const year = date.toLocaleDateString('en-GB', { year: '2-digit', timeZone: 'UTC' });
  return granularity === 'month' ? `${month} ${year}` : `${day} ${month}`;
}

export default reportRepo;