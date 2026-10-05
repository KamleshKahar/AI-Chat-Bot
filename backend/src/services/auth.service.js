import bcrypt from 'bcryptjs';
import { prisma } from '../config/prisma.js';
import { AppError } from '../errors/AppError.js';
import { auditRepo } from '../repositories/audit.repo.js';
import { userRepo } from '../repositories/user.repo.js';
import { signToken } from '../middleware/auth.js';
import { serializeUser } from '../serializers/index.js';

const BCRYPT_ROUNDS = 10;

export const authService = {
  /**
   * Verify credentials and issue a token.
   *
   * The failure message is deliberately identical for "no such user" and "wrong
   * password" so the endpoint cannot be used to enumerate registered accounts.
   */
  async login({ email, password }, { ip } = {}) {
    const user = await userRepo.findByEmail(email);

    const hash = user?.passwordHash ?? '$2b$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidiu';
    const ok = await bcrypt.compare(password, hash);

    if (!user || !ok) {
      await auditRepo.write({
        actorUserId: user?.id ?? null,
        action: 'LOGIN_FAILED',
        entityType: 'user',
        entityId: email,
        ip,
      });
      throw AppError.unauthorized('Invalid email or password');
    }

    if (!user.isActive) throw AppError.forbidden('Account is deactivated');

    await userRepo.touchLogin(user.id);
    await auditRepo.write({
      actorUserId: user.id,
      action: 'LOGIN',
      entityType: 'user',
      entityId: String(user.id),
      ip,
    });

    return { token: signToken(user), user: serializeUser(user) };
  },

  async me(userId) {
    const user = await userRepo.findById(userId);
    if (!user) throw AppError.notFound('Account no longer exists');
    return serializeUser(user);
  },

  /**
   * Stateless JWT logout: the token is simply discarded by the client. Recorded
   * for the audit trail.
   */
  async logout(user, { ip } = {}) {
    await auditRepo.write({
      actorUserId: user?.id ?? null,
      action: 'LOGOUT',
      entityType: 'user',
      entityId: user ? String(user.id) : null,
      ip,
    });
    return { success: true };
  },

  async changePassword(userId, { currentPassword, newPassword }, { ip } = {}) {
    const user = await prisma.user.findUnique({ where: { id: Number(userId) } });
    if (!user) throw AppError.notFound('Account not found');

    const ok = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!ok) {
      throw AppError.validation('Current password is incorrect', {
        currentPassword: 'Incorrect password',
      });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await bcrypt.hash(newPassword, BCRYPT_ROUNDS) },
    });

    await auditRepo.write({
      actorUserId: user.id,
      action: 'CHANGE_PASSWORD',
      entityType: 'user',
      entityId: String(user.id),
      ip,
    });

    return { success: true };
  },

  /** Exposed so the seeder can reuse exactly the same hashing rules. */
  hashPassword(plain) {
    return bcrypt.hash(plain, BCRYPT_ROUNDS);
  },
};

export default authService;