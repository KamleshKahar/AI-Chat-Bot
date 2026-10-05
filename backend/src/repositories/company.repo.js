import { prisma } from '../config/prisma.js';

/**
 * Company profile. Single-tenant: this table has exactly one row (id = 1).
 */
export const companyRepo = {
  async get(db = prisma) {
    let row = await db.companyProfile.findFirst({ orderBy: { id: 'asc' } });
    if (!row) {
      row = await db.companyProfile.create({
        data: { name: 'FlowPilot Solutions Pvt Ltd', invoicePrefix: 'INV' },
      });
    }
    return row;
  },

  async update(data, db = prisma) {
    const current = await this.get(db);
    return db.companyProfile.update({ where: { id: current.id }, data });
  },

  async state(db = prisma) {
    const row = await this.get(db);
    return { state: row.state, name: row.name };
  },
};

export default companyRepo;