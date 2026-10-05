import { Router } from 'express';
import { asyncHandler } from '../errors/asyncHandler.js';
import { authenticate } from '../middleware/auth.js';
import { requirePermission, PERMISSIONS } from '../middleware/roles.js';
import { validate } from '../middleware/validate.js';
import {
  createProductSchema,
  updateProductSchema,
  stockAdjustmentSchema,
  productListQuerySchema,
  productDetailStatsQuery,
  idParam,
} from '../schemas/validators.js';
import { productController } from '../controllers/product.controller.js';

const router = Router();

router.use(authenticate);

router.get(
  '/',
  requirePermission(PERMISSIONS.PRODUCT_READ),
  validate({ query: productListQuerySchema }),
  asyncHandler(productController.list)
);

router.get(
  '/:id',
  requirePermission(PERMISSIONS.PRODUCT_READ),
  validate({ params: idParam, query: productDetailStatsQuery }),
  asyncHandler(productController.detail)
);

router.post(
  '/',
  requirePermission(PERMISSIONS.PRODUCT_WRITE),
  validate({ body: createProductSchema }),
  asyncHandler(productController.create)
);

router.put(
  '/:id',
  requirePermission(PERMISSIONS.PRODUCT_WRITE),
  validate({ params: idParam, body: updateProductSchema }),
  asyncHandler(productController.update)
);

router.delete(
  '/:id',
  // Destructive: ADMIN only. Soft delete preserves historical stock references.
  requirePermission(PERMISSIONS.PRODUCT_DELETE),
  validate({ params: idParam }),
  asyncHandler(productController.remove)
);

router.post(
  '/:id/stock-adjustments',
  requirePermission(PERMISSIONS.PRODUCT_ADJUST_STOCK),
  validate({ params: idParam, body: stockAdjustmentSchema }),
  asyncHandler(productController.adjustStock)
);

export default router;