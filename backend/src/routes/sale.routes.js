import { Router } from 'express';
import { asyncHandler } from '../errors/asyncHandler.js';
import { authenticate } from '../middleware/auth.js';
import { requirePermission, PERMISSIONS } from '../middleware/roles.js';
import { validate } from '../middleware/validate.js';
import { createSaleSchema, saleListQuerySchema, idParam } from '../schemas/validators.js';
import { saleController } from '../controllers/sale.controller.js';

const router = Router();

router.use(authenticate);

router.get(
  '/',
  requirePermission(PERMISSIONS.SALE_READ),
  validate({ query: saleListQuerySchema }),
  asyncHandler(saleController.list)
);

router.get(
  '/:id',
  requirePermission(PERMISSIONS.SALE_READ),
  validate({ params: idParam }),
  asyncHandler(saleController.get)
);

router.post(
  '/',
  requirePermission(PERMISSIONS.SALE_CREATE),
  validate({ body: createSaleSchema }),
  asyncHandler(saleController.create)
);

export default router;