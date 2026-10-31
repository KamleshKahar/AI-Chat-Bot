import { Router } from 'express';
import { asyncHandler } from '../errors/asyncHandler.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { loginSchema, changePasswordSchema, setupSchema } from '../schemas/validators.js';
import { authController } from '../controllers/auth.controller.js';

const router = Router();

// --- public, first-run only: both self-close once any account exists --------
router.get('/setup-status', asyncHandler(authController.setupStatus));
router.post('/setup', validate({ body: setupSchema }), asyncHandler(authController.setup));

router.post('/login', validate({ body: loginSchema }), asyncHandler(authController.login));
router.post('/logout', authenticate, asyncHandler(authController.logout));
router.get('/me', authenticate, asyncHandler(authController.me));
router.post(
  '/change-password',
  authenticate,
  validate({ body: changePasswordSchema }),
  asyncHandler(authController.changePassword)
);

export default router;