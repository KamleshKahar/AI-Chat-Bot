import { Router } from 'express';
import { asyncHandler } from '../errors/asyncHandler.js';
import { authenticate } from '../middleware/auth.js';
import { requirePermission, PERMISSIONS } from '../middleware/roles.js';
import { validate } from '../middleware/validate.js';
import {
  creditNoteListQuerySchema,
  createCreditNoteSchema,
  idParam,
} from '../schemas/validators.js';
import { creditNoteController } from '../controllers/creditNote.controller.js';

const router = Router();

router.use(authenticate);

// Reading a return document is as open as reading the invoice it credits.
router.get(
  '/',
  requirePermission(PERMISSIONS.CREDIT_NOTE_READ),
  validate({ query: creditNoteListQuerySchema }),
  asyncHandler(creditNoteController.list)
);

router.get(
  '/:id',
  requirePermission(PERMISSIONS.CREDIT_NOTE_READ),
  validate({ params: idParam }),
  asyncHandler(creditNoteController.get)
);

// Issuing one reverses invoiced money and restocks inventory — ADMIN/MANAGER.
router.post(
  '/',
  requirePermission(PERMISSIONS.CREDIT_NOTE_CREATE),
  validate({ body: createCreditNoteSchema }),
  asyncHandler(creditNoteController.create)
);

// Full reversal (stock, ledger, invoice credit). Destructive: ADMIN only,
// same gate as cancelling an invoice.
router.delete(
  '/:id',
  requirePermission(PERMISSIONS.COMPANY_WRITE),
  validate({ params: idParam }),
  asyncHandler(creditNoteController.remove)
);

export default router;
