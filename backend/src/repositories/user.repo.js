import { prisma } from '../config/prisma.js';

export const userRepo = {
  findByEmail(email, db = prisma) {
    return db.user.findUnique({ where: { email: String(email).toLowerCase() } });
  },

  findById(id, db = prisma) {
    return db.user.findUnique({ where: { id: Number(id) } });
  },

  touchLogin(id, db = prisma) {
    return db.user.update({
      where: { id: Number(id) },
      data: { lastLoginAt: new Date() },
    });
  },

  count(db = prisma) {
    return db.user.count();
  },

  /** Active administrators — the guard behind "never lock everyone out". */
  countActiveAdmins(db = prisma) {
    return db.user.count({ where: { role: 'ADMIN', isActive: true } });
  },

  /**
   * Paged, filtered list for the /users screen.
   *
   * @returns {Promise<{ rows: object[], total: number }>}
   */
  async list({ search, role, status, sort = 'name', order = 'asc', skip, take }, db = prisma) {
    const where = {
      ...(role ? { role } : {}),
      ...(status ? { isActive: status === 'active' } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search } },
              { email: { contains: search } },
            ],
          }
        : {}),
    };

    // MySQL's default collation is case-insensitive, so `contains` behaves the
    // way a search box should without any explicit mode handling.
    const direction = order === 'desc' ? 'desc' : 'asc';
    const orderBy =
      sort === 'recent'
        ? { createdAt: 'desc' } // recency is always newest-first
        : sort === 'last_login'
          ? { lastLoginAt: direction }
          : sort === 'role'
            ? { role: direction }
            : sort === 'email'
              ? { email: direction }
              : { name: direction };

    const [rows, total] = await Promise.all([
      db.user.findMany({ where, orderBy, skip, take }),
      db.user.count({ where }),
    ]);
    return { rows, total };
  },

  create(data, db = prisma) {
    return db.user.create({ data });
  },

  update(id, data, db = prisma) {
    return db.user.update({ where: { id: Number(id) }, data });
  },
};

export default userRepo;
