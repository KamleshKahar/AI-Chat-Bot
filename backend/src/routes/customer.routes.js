import { Router } from 'express';
import { asyncHandler } from '../errors/asyncHandler.js';
import { authenticate } from '../middleware/auth.js';
import { requirePermission, PERMISSIONS } from '../middleware/roles.js';
import { validate } from '../middleware/validate.js';
import {
  createCustomerSchema,
  updateCustomerSchema,
  customerListQuerySchema,
  idParam,
} from '../schemas/validators.js';
import { customerController } from '../controllers/customer.controller.js';

const router = Router();

router.use(authenticate);

router.get(
  '/',
  requirePermission(PERMISSIONS.CUSTOMER_READ),
  validate({ query: customerListQuerySchema }),
  asyncHandler(customerController.list)
);

router.get(
  '/:id',
  requirePermission(PERMISSIONS.CUSTOMER_READ),
  validate({ params: idParam }),
  asyncHandler(customerController.detail)
);

router.post(
  '/',
  requirePermission(PERMISSIONS.CUSTOMER_WRITE),
  validate({ body: createCustomerSchema }),
  asyncHandler(customerController.create)
);

router.put(
  '/:id',
  requirePermission(PERMISSIONS.CUSTOMER_WRITE),
  validate({ params: idParam, body: updateCustomerSchema }),
  asyncHandler(customerController.update)
);

router.delete(
  '/:id',
  requirePermission(PERMISSIONS.CUSTOMER_DELETE),
  validate({ params: idParam }),
  asyncHandler(customerController.remove)
);

export default router;