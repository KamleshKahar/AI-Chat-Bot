import { Router } from 'express';
import { asyncHandler } from '../errors/asyncHandler.js';
import { authenticate } from '../middleware/auth.js';
import { requirePermission, PERMISSIONS } from '../middleware/roles.js';
import { seedController } from '../controllers/seed.controller.js';

const router = Router();

router.post(
  '/reset',
  authenticate,
  // ADMIN only — this wipes every table.
  requirePermission(PERMISSIONS.SEED_RESET),
  asyncHandler(seedController.reset)
);

export default router;