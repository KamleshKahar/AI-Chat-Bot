import { Router } from 'express';
import authRoutes from './auth.routes.js';
import companyRoutes from './company.routes.js';
import categoryRoutes from './category.routes.js';
import productRoutes from './product.routes.js';
import customerRoutes from './customer.routes.js';
import saleRoutes from './sale.routes.js';
import invoiceRoutes from './invoice.routes.js';
import seedRoutes from './seed.routes.js';
import { dashboard, ledger, reports } from './report.routes.js';
import { asyncHandler } from '../errors/asyncHandler.js';
import { prisma } from '../config/prisma.js';

/**
 * API surface. Mounted at /api by src/app.js.
 */
const router = Router();

/** Unauthenticated liveness probe — also confirms the database is reachable. */
router.get(
  '/health',
  asyncHandler(async (req, res) => {
    let database = 'up';
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      database = 'down';
    }
    res.status(database === 'up' ? 200 : 503).json({
      status: database === 'up' ? 'ok' : 'degraded',
      database,
      timestamp: new Date().toISOString(),
    });
  })
);

router.use('/auth', authRoutes);
router.use('/company', companyRoutes);
router.use('/categories', categoryRoutes);
router.use('/products', productRoutes);
router.use('/customers', customerRoutes);
router.use('/sales', saleRoutes);
router.use('/invoices', invoiceRoutes);
router.use('/dashboard', dashboard);
router.use('/ledger', ledger);
router.use('/reports', reports);
router.use('/seed', seedRoutes);

export default router;