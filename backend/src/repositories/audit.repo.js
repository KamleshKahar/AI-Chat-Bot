import { prisma } from '../config/prisma.js';
import { logger } from '../lib/logger.js';

/**
 * Audit trail for money-bearing records.
 *
 * Writes deliberately do NOT propagate failures: a rejected insert must not roll
 * back a sale that has already been committed. The error is logged loudly
 * instead so the gap is still visible.
 */
export const auditRepo = {
  async write({ actorUserId, action, entityType, entityId, before, after, ip }, db = prisma) {
    try {
      await db.auditLog.create({
        data: {
          actorUserId: actorUserId ?? null,
          action,
          entityType,
          entityId: entityId ? String(entityId) : null,
          beforeJson: before ? JSON.stringify(before) : null,
          afterJson: after ? JSON.stringify(after) : null,
          ip: ip ? String(ip).slice(0, 64) : null,
        },
      });
    } catch (err) {
      logger.error(
        `AUDIT_WRITE_FAILED action=${action} entity=${entityType}:${entityId ?? '-'} — ${err.message}`
      );
    }
  },

  listForEntity(entityType, entityId, db = prisma) {
    return db.auditLog.findMany({
      where: { entityType, entityId: String(entityId) },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  },
};

export default auditRepo;