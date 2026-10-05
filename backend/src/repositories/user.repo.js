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

  list({ skip, take }, db = prisma) {
    return db.user.findMany({ skip, take, orderBy: { id: 'asc' } });
  },

  count(db = prisma) {
    return db.user.count();
  },
};

export default userRepo;