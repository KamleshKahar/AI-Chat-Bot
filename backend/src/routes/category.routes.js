import { Router } from 'express';
import { asyncHandler } from '../errors/asyncHandler.js';
import { authenticate } from '../middleware/auth.js';
import { requirePermission, PERMISSIONS } from '../middleware/roles.js';
import { validate } from '../middleware/validate.js';
import {
  createCategorySchema,
  updateCategorySchema,
  categoryIdParam,
} from '../schemas/validators.js';
import { categoryController } from '../controllers/category.controller.js';

const router = Router();

router.use(authenticate);

router.get('/', requirePermission(PERMISSIONS.CATEGORY_READ), asyncHandler(categoryController.list));

router.post(
  '/',
  requirePermission(PERMISSIONS.CATEGORY_WRITE),
  validate({ body: createCategorySchema }),
  asyncHandler(categoryController.create)
);

router.patch(
  '/:id',
  requirePermission(PERMISSIONS.CATEGORY_WRITE),
  validate({ params: categoryIdParam, body: updateCategorySchema }),
  asyncHandler(categoryController.update)
);

router.delete(
  '/:id',
  requirePermission(PERMISSIONS.CATEGORY_DELETE),
  validate({ params: categoryIdParam }),
  asyncHandler(categoryController.remove)
);

export default router;