import crypto from 'node:crypto';
import { prisma } from '../config/prisma.js';
import { AppError } from '../errors/AppError.js';
import { auditRepo } from '../repositories/audit.repo.js';
import { userRepo } from '../repositories/user.repo.js';
import { authService } from './auth.service.js';
import { signToken } from '../middleware/auth.js';
import { serializeUser } from '../serializers/index.js';

/**
 * User administration: the first-run setup and the /users screen.
 *
 * Every function takes `db = prisma` (the repository convention) so the guards
 * — last-admin protection, self-action rules, duplicate email — can be unit
 * tested against an in-memory fake instead of MySQL. The guard logic lives
 * here, never in the routes: permissions decide *who may call*, these rules
 * decide *what may happen* regardless of caller.
 */

export const userService = {
  async list(query, db = prisma) {
    const { rows, total } = await userRepo.list(query, db);
    return { rows: rows.map(serializeUser), total };
  },

  async detail(id, db = prisma) {
    const row = await userRepo.findById(id, db);
    if (!row) throw AppError.notFound('User not found');
    return serializeUser(row);
  },

  /**
   * Create an account. The duplicate-email check is a plain read-then-write,
   * which is safe here: `users.email` carries a UNIQUE constraint, so a race
   * loses to the database rather than creating a second account with the same
   * address — the winner just gets a less friendly 500, which the UNIQUE index
   * on `email` makes astronomically unlikely in practice.
   */
  async create(data, actor, { ip } = {}, db = prisma) {
    const email = String(data.email).toLowerCase();
    const existing = await userRepo.findByEmail(email, db);
    if (existing) {
      throw AppError.conflict('An account with this email already exists', {
        details: { email: 'An account with this email already exists' },
      });
    }

    const row = await userRepo.create(
      {
        email,
        passwordHash: await authService.hashPassword(data.password),
        name: data.name,
        role: data.role ?? 'VIEWER',
        phone: data.phone ?? null,
        isActive: data.isActive ?? true,
      },
      db
    );

    await auditRepo.write(
      {
        actorUserId: actor?.id ?? null,
        action: 'CREATE',
        entityType: 'user',
        entityId: row.id,
        after: { name: row.name, email: row.email, role: row.role, isActive: row.isActive },
        ip,
      },
      db
    );
    return serializeUser(row);
  },

  /**
   * Update name / phone / role / active flag.
   *
   * Two rules cannot be broken by any caller, not even an ADMIN:
   *   1. You cannot change your own role or status — that is how an admin
   *      locks themselves out (or worse, quietly grants themselves a status
   *      the audit trail shows as someone else's action).
   *   2. The last active ADMIN cannot be demoted or deactivated — the
   *      system must never end up with no way back in.
   */
  async update(id, data, actor, { ip } = {}, db = prisma) {
    const before = await userRepo.findById(id, db);
    if (!before) throw AppError.notFound('User not found');

    const touchesRoleOrStatus = data.role !== undefined || data.isActive !== undefined;
    const wouldChangeRole = data.role !== undefined && data.role !== before.role;
    const wouldChangeStatus =
      data.isActive !== undefined && Boolean(data.isActive) !== Boolean(before.isActive);

    if (touchesRoleOrStatus && actor && Number(actor.id) === Number(before.id)) {
      if (wouldChangeRole || (data.isActive !== undefined && !data.isActive)) {
        throw AppError.forbidden('You cannot change your own role or deactivate your own account');
      }
    }

    // Only a *loss* of admin status trips this: demotion away from ADMIN, or
    // deactivation. A name/phone edit on an admin is not a loss of anything —
    // without the `wouldChangeStatus` guard, `data.isActive === undefined`
    // would read as `!undefined === true` and block ordinary edits.
    const losingAdmin =
      before.role === 'ADMIN' &&
      before.isActive &&
      (wouldChangeRole || (wouldChangeStatus && !data.isActive));
    if (losingAdmin) {
      const activeAdmins = await userRepo.countActiveAdmins(db);
      if (activeAdmins <= 1) {
        throw AppError.conflict(
          'This is the last active administrator. Promote another user to ADMIN first.'
        );
      }
    }

    // Never let an update clear a column the caller did not mention.
    const patch = {};
    if (data.name !== undefined) patch.name = data.name;
    if (data.role !== undefined) patch.role = data.role;
    if (data.phone !== undefined) patch.phone = data.phone;
    if (data.isActive !== undefined) patch.isActive = data.isActive;

    const row = await userRepo.update(id, patch, db);

    await auditRepo.write(
      {
        actorUserId: actor?.id ?? null,
        action: 'UPDATE',
        entityType: 'user',
        entityId: row.id,
        before: { name: before.name, role: before.role, isActive: before.isActive },
        after: { name: row.name, role: row.role, isActive: row.isActive },
        ip,
      },
      db
    );
    return serializeUser(row);
  },

  /**
   * Set a new password for an account (ADMIN recovery flow).
   *
   * When `newPassword` is omitted the server generates one; it is returned
   * exactly once, in this response, and never stored in plain text — only the
   * bcrypt hash lands in the database. `crypto` rather than `Math.random`:
   * these passwords are the credentials a real person will sign in with.
   */
  async resetPassword(id, { newPassword } = {}, actor, { ip } = {}, db = prisma) {
    const row = await userRepo.findById(id, db);
    if (!row) throw AppError.notFound('User not found');

    const generated = !newPassword;
    const plain = newPassword ?? generatePassword();

    await userRepo.update(id, { passwordHash: await authService.hashPassword(plain) }, db);

    await auditRepo.write(
      {
        actorUserId: actor?.id ?? null,
        action: 'RESET_PASSWORD',
        entityType: 'user',
        entityId: row.id,
        after: { email: row.email, generated },
        ip,
      },
      db
    );

    return {
      id: String(row.id),
      email: row.email,
      generated,
      // Only meaningful when the server minted it — the UI shows it in a
      // one-time dialog and the admin copies it to the user out of band.
      tempPassword: generated ? plain : null,
    };
  },

  /** Whether the very first account still has to be created. */
  async setupStatus(db = prisma) {
    return { needsSetup: (await userRepo.count(db)) === 0 };
  },

  /**
   * First-run setup: create the initial ADMIN (optionally with the company
   * letterhead) and sign them in.
   *
   * Concurrency: two browser tabs landing on `/setup` simultaneously must not
   * both create an administrator. A transaction is not enough — MySQL's
   * REPEATABLE READ would let both read a count of 0 — so a MySQL advisory
   * lock (`GET_LOCK`) serialises the critical section. The count re-check
   * inside the lock is what makes the second tab fail with 409 instead of
   * creating a duplicate first admin.
   */
  async runSetup(data, { ip } = {}, db = prisma) {
    const locked = await acquireSetupLock(db);
    if (!locked) {
      throw AppError.conflict('Setup is already in progress. Reload the page.');
    }

    try {
      if ((await userRepo.count(db)) > 0) {
        throw AppError.conflict('Setup has already been completed');
      }

      const row = await userRepo.create(
        {
          email: String(data.email).toLowerCase(),
          passwordHash: await authService.hashPassword(data.password),
          name: data.name,
          role: 'ADMIN',
          phone: null,
          isActive: true,
        },
        db
      );

      // Optional wizard step. If the row already exists (a pre-existing
      // deployment that somehow has no users), leave it alone — upsert by
      // first-row semantics would overwrite real letterhead data.
      if (data.company) {
        const companyExists = await db.companyProfile.findFirst({ orderBy: { id: 'asc' } });
        if (!companyExists) {
          await db.companyProfile.create({ data: { ...data.company, invoicePrefix: 'INV' } });
        }
      }

      await auditRepo.write(
        {
          actorUserId: row.id,
          action: 'SETUP',
          entityType: 'user',
          entityId: row.id,
          after: { name: row.name, email: row.email, role: row.role },
          ip,
        },
        db
      );

      return { token: signToken(row), user: serializeUser(row) };
    } finally {
      await releaseSetupLock(db);
    }
  },
};

/** 12 chars from a 62-symbol alphabet ≈ 71 bits — comfortably above the 8-char floor. */
function generatePassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(12);
  let out = '';
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}

async function acquireSetupLock(db) {
  const rows = await db.$queryRaw`SELECT GET_LOCK('flowpilot_setup', 10) AS locked`;
  const value = rows?.[0]?.locked;
  return value === 1 || value === 1n || value === '1';
}

async function releaseSetupLock(db) {
  try {
    await db.$queryRaw`SELECT RELEASE_LOCK('flowpilot_setup')`;
  } catch {
    // The connection closing releases advisory locks anyway; a failed
    // release must not mask the real result of the setup attempt.
  }
}

export default userService;
