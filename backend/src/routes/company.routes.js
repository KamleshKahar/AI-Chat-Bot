import { Router } from 'express';
import { asyncHandler } from '../errors/asyncHandler.js';
import { authenticate } from '../middleware/auth.js';
import { requirePermission, PERMISSIONS } from '../middleware/roles.js';
import { validate } from '../middleware/validate.js';
import { updateCompanySchema } from '../schemas/validators.js';
import { companyController } from '../controllers/company.controller.js';

const router = Router();

router.use(authenticate);

router.get(
  '/',
  requirePermission(PERMISSIONS.COMPANY_READ),
  asyncHandler(companyController.get)
);

router.put(
  '/',
  requirePermission(PERMISSIONS.COMPANY_WRITE),
  validate({ body: updateCompanySchema }),
  asyncHandler(companyController.update)
);

export default router;