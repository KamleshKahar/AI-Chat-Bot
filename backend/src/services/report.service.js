import { reportRepo } from '../repositories/report.repo.js';
import { ledgerRepo } from '../repositories/ledger.repo.js';
import { productRepo } from '../repositories/product.repo.js';
import { invoiceRepo } from '../repositories/invoice.repo.js';
import { toPaymentMethodLabel } from '../lib/enums.js';
import { d } from '../lib/decimal.js';

/**
 * Reporting service.
 *
 * Each method mirrors one of the frontend's client-side aggregation helpers so
 * the Reports screen's rendering code can stay as-is while the maths moves to
 * SQL. See repositories/report.repo.js for the queries.
 */
export const reportService = {
  salesSummary(params) {
    return reportRepo.salesSummary(params);
  },

  revenueTrend(params) {
    return reportRepo.revenueTrend(params);
  },

  async paymentBreakdown(params) {
    const rows = await reportRepo.paymentBreakdown(params);
    return rows.map((r) => ({ ...r, method: toPaymentMethodLabel(r.method) ?? r.method }));
  },

  async productPerformance(params) {
    const rows = await reportRepo.productPerformance(params);
    return {
      products: rows,
      totals: {
        products: rows.length,
        unitsSold: rows.reduce((acc, r) => acc + r.unitsSold, 0),
        revenue: rows.reduce((acc, r) => acc + Number(d(r.revenue)), 0),
        profit: rows.reduce((acc, r) => acc + Number(d(r.profit)), 0),
        stockValue: rows.reduce((acc, r) => acc + Number(d(r.stockValue)), 0),
      },
    };
  },

  async inventoryValuation() {
    const [byCategory, overall, counts] = await Promise.all([
      reportRepo.inventoryByCategory(),
      productRepo.inventoryValue(),
      productRepo.statusCounts(),
    ]);

    const costValue = Number(d(overall.costValue));
    const retailValue = Number(d(overall.retailValue));

    return {
      totals: {
        products: overall.products,
        units: overall.units,
        costValue,
        retailValue,
        potentialProfit: retailValue - costValue,
        statusCounts: counts,
      },
      byCategory,
    };
  },

  async customerPerformance(params) {
    const rows = await reportRepo.customerPerformance(params);
    return {
      customers: rows,
      totals: {
        customers: rows.length,
        lifetimeValue: rows.reduce((acc, r) => acc + Number(d(r.lifetimeValue)), 0),
        collected: rows.reduce((acc, r) => acc + Number(d(r.collected)), 0),
        outstanding: rows.reduce((acc, r) => acc + Number(d(r.outstanding)), 0),
        orders: rows.reduce((acc, r) => acc + r.orders, 0),
      },
    };
  },

  /** Cash position over the window — used by the Payments tab. */
  async cashFlow(params) {
    const [totals, breakdown] = await Promise.all([
      ledgerRepo.directionTotals(params),
      this.paymentBreakdown(params),
    ]);
    return {
      cashIn: Number(d(totals.IN)),
      cashOut: Number(d(totals.OUT)),
      net: Number(d(totals.IN).minus(totals.OUT)),
      inEntries: totals.inEntries,
      outEntries: totals.outEntries,
      byMethod: breakdown,
    };
  },

  /** Receivables aging — how much is owed and how late it is. */
  async receivablesAging() {
    const rows = await invoiceRepo.agingBuckets();
    const outstanding = rows
      .filter((r) => r.bucket !== 'settled')
      .reduce((acc, r) => acc + Number(d(r.amount)), 0);

    return {
      buckets: rows,
      outstanding,
      overdue: rows
        .filter((r) => ['1-30', '31-60', '60+'].includes(r.bucket))
        .reduce((acc, r) => acc + Number(d(r.amount)), 0),
    };
  },
};

export default reportService;