import { customerRepo } from '../repositories/customer.repo.js';
import { invoiceRepo } from '../repositories/invoice.repo.js';
import { ledgerRepo } from '../repositories/ledger.repo.js';
import { productRepo } from '../repositories/product.repo.js';
import { serializeProduct, serializeTransaction } from '../serializers/index.js';

/**
 * Dashboard metrics.
 *
 * The metric names are fixed by the frontend, which destructures these exact
 * names in StatCards and the low-stock bell. The controller wraps this in the
 * standard `{ data }` envelope, so it reaches the client as:
 *
 *   { data: { metrics: { totalRevenue, totalSalesValue, totalOrders,
 *                        totalOutstanding, totalProducts, lowStockCount,
 *                        outOfStockCount, lowStockProducts[],
 *                        outOfStockProducts[], totalInventoryValue } } }
 *
 * Definitions follow frontend/context/DataContext.js exactly:
 *   totalRevenue       = SUM(invoices.paid_amount)   — money actually collected
 *   totalSalesValue    = SUM(invoices.grand_total)   — money invoiced
 *   totalOutstanding   = SUM(customer opening_balance + invoice balance_due)
 *   totalInventoryValue= SUM(stock_quantity * cost_price)
 */
export const dashboardService = {
  async summary() {
    const [totals, customers, inventory, counts, lowRows] = await Promise.all([
      invoiceRepo.headlineTotals(),
      customerRepo.totals(),
      productRepo.inventoryValue(),
      productRepo.statusCounts(),
      productRepo.lowStock(200),
    ]);

    const products = lowRows.map(serializeProduct);
    const lowStockProducts = products.filter((p) => p.status === 'low_stock');
    const outOfStockProducts = products.filter((p) => p.status === 'out_of_stock');

    return {
      metrics: {
        totalRevenue: Number(totals.totalRevenue),
        totalSalesValue: Number(totals.totalSalesValue),
        totalOrders: totals.totalOrders,
        totalOutstanding: Number(customers.outstanding),
        totalProducts: inventory.products,
        lowStockCount: counts.low_stock,
        outOfStockCount: counts.out_of_stock,
        lowStockProducts,
        outOfStockProducts,
        totalInventoryValue: Number(inventory.costValue),
        totalStockUnits: inventory.units,
        // Per-status invoice tallies, so the Invoices screen's filter chips read
        // real counts instead of counting the ten rows currently in hand.
        invoiceCounts: await invoiceRepo.paymentStatusCounts(),
        // Money past its due date. Derived from `due_date` against today in SQL,
        // so it cannot drift from the Overdue filter the user clicks next to it.
        totalOverdue: Number(
          (
            await invoiceRepo.overdueTotal()
          ).overdueAmount
        ),
        totalTaxCollected: Number(totals.totalTax),
        totalDiscountGiven: Number(totals.totalDiscount),
        totalCustomers: customers.customers,
      },
    };
  },

  /** Low + out of stock products for the header bell and the alerts panel. */
  async alerts(limit = 5) {
    const rows = await productRepo.lowStock(Math.max(1, Number(limit) * 2));
    const products = rows.map(serializeProduct);
    return {
      lowStock: products.filter((p) => p.status === 'low_stock').slice(0, limit),
      outOfStock: products.filter((p) => p.status === 'out_of_stock').slice(0, limit),
      counts: await productRepo.statusCounts(),
    };
  },

  async transactions(limit = 5) {
    const rows = await ledgerRepo.recent(limit);
    return rows.map(serializeTransaction);
  },
};

export default dashboardService;