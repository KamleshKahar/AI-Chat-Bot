import { Router } from 'express';
import { asyncHandler } from '../errors/asyncHandler.js';
import { authenticate } from '../middleware/auth.js';
import { requirePermission, PERMISSIONS } from '../middleware/roles.js';
import { validate } from '../middleware/validate.js';
import { limitQuerySchema, reportQuerySchema, ledgerListQuerySchema } from '../schemas/validators.js';
import {
  dashboardController,
  ledgerController,
  reportController,
} from '../controllers/report.controller.js';

// --- /dashboard -------------------------------------------------------------
const dashboard = Router();
dashboard.use(authenticate);
dashboard.get(
  '/summary',
  requirePermission(PERMISSIONS.DASHBOARD_READ),
  asyncHandler(dashboardController.summary)
);
dashboard.get(
  '/alerts',
  requirePermission(PERMISSIONS.DASHBOARD_READ),
  validate({ query: limitQuerySchema }),
  asyncHandler(dashboardController.alerts)
);
dashboard.get(
  '/transactions',
  requirePermission(PERMISSIONS.DASHBOARD_READ),
  validate({ query: limitQuerySchema }),
  asyncHandler(dashboardController.transactions)
);

// --- /ledger (the structured replacement for `transactions`) -----------------
const ledger = Router();
ledger.use(authenticate);
ledger.get(
  '/',
  requirePermission(PERMISSIONS.LEDGER_READ),
  validate({ query: ledgerListQuerySchema }),
  asyncHandler(ledgerController.list)
);

// --- /reports ---------------------------------------------------------------
const reports = Router();
reports.use(authenticate, requirePermission(PERMISSIONS.REPORT_READ));

const withRange = (handler) => [validate({ query: reportQuerySchema }), asyncHandler(handler)];

reports.get('/sales-summary', ...withRange(reportController.salesSummary));
reports.get('/revenue-trend', ...withRange(reportController.revenueTrend));
reports.get('/payment-breakdown', ...withRange(reportController.paymentBreakdown));
reports.get('/product-performance', ...withRange(reportController.productPerformance));
reports.get('/inventory-valuation', asyncHandler(reportController.inventoryValuation));
reports.get('/customer-performance', ...withRange(reportController.customerPerformance));
reports.get('/cash-flow', ...withRange(reportController.cashFlow));
reports.get('/receivables-aging', asyncHandler(reportController.receivablesAging));

export { dashboard, ledger, reports };
export default reports;