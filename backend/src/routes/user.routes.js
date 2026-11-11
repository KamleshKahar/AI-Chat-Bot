import { Router } from 'express';
import { asyncHandler } from '../errors/asyncHandler.js';
import { authenticate } from '../middleware/auth.js';
import { requirePermission, PERMISSIONS } from '../middleware/roles.js';
import { validate } from '../middleware/validate.js';
import { idParam, createUserSchema, updateUserSchema, resetPasswordSchema, userListQuerySchema } from '../schemas/validators.js';
import { userController } from '../controllers/user.controller.js';

/**
 * User administration. ADMIN-only by permission (`user:read` / `user:write`
 * are granted to no other role in `middleware/roles.js`).
 */
const router = Router();

router.use(authenticate);

router.get(
  '/',
  requirePermission(PERMISSIONS.USER_READ),
  validate({ query: userListQuerySchema }),
  asyncHandler(userController.list)
);

router.post(
  '/',
  requirePermission(PERMISSIONS.USER_WRITE),
  validate({ body: createUserSchema }),
  asyncHandler(userController.create)
);

router.get(
  '/:id',
  requirePermission(PERMISSIONS.USER_READ),
  validate({ params: idParam }),
  asyncHandler(userController.detail)
);

router.patch(
  '/:id',
  requirePermission(PERMISSIONS.USER_WRITE),
  validate({ params: idParam, body: updateUserSchema }),
  asyncHandler(userController.update)
);

router.post(
  '/:id/reset-password',
  requirePermission(PERMISSIONS.USER_WRITE),
  validate({ params: idParam, body: resetPasswordSchema }),
  asyncHandler(userController.resetPassword)
);

export default router;
