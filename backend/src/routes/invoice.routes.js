import { Router } from 'express';
import { asyncHandler } from '../errors/asyncHandler.js';
import { authenticate } from '../middleware/auth.js';
import { requirePermission, PERMISSIONS } from '../middleware/roles.js';
import { validate } from '../middleware/validate.js';
import { invoiceListQuerySchema, recordPaymentSchema, idParam } from '../schemas/validators.js';
import { invoiceController } from '../controllers/invoice.controller.js';

const router = Router();

router.use(authenticate);

router.get(
  '/',
  requirePermission(PERMISSIONS.INVOICE_READ),
  validate({ query: invoiceListQuerySchema }),
  asyncHandler(invoiceController.list)
);

router.get(
  '/:id',
  requirePermission(PERMISSIONS.INVOICE_READ),
  validate({ params: idParam }),
  asyncHandler(invoiceController.get)
);

// Money movement — ADMIN and MANAGER only.
router.post(
  '/:id/payments',
  requirePermission(PERMISSIONS.INVOICE_PAY),
  validate({ params: idParam, body: recordPaymentSchema }),
  asyncHandler(invoiceController.recordPayment)
);

router.delete(
  '/:id',
  requirePermission(PERMISSIONS.COMPANY_WRITE),
  validate({ params: idParam }),
  asyncHandler(invoiceController.remove)
);

export default router;