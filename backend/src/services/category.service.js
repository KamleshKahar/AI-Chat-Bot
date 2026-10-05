import { categoryRepo } from '../repositories/category.repo.js';
import { auditRepo } from '../repositories/audit.repo.js';
import { serializeCategory } from '../serializers/index.js';

export const categoryService = {
  async list() {
    return categoryRepo.listAll().then((rows) => rows.map(serializeCategory));
  },

  async create(data, actor, { ip } = {}) {
    const row = await categoryRepo.create(data);
    await auditRepo.write({
      actorUserId: actor?.id ?? null,
      action: 'CREATE',
      entityType: 'category',
      entityId: row.code,
      after: { name: row.name },
      ip,
    });
    return serializeCategory(row);
  },

  async update(id, data, actor, { ip } = {}) {
    const before = await categoryRepo.findById(id);
    const row = await categoryRepo.update(id, data);
    await auditRepo.write({
      actorUserId: actor?.id ?? null,
      action: 'UPDATE',
      entityType: 'category',
      entityId: row.code,
      before: { name: before?.name },
      after: { name: row.name },
      ip,
    });
    return serializeCategory(row);
  },

  async remove(id, actor, { ip } = {}) {
    const row = await categoryRepo.softDelete(id);
    await auditRepo.write({
      actorUserId: actor?.id ?? null,
      action: 'DELETE',
      entityType: 'category',
      entityId: row.code,
      before: { name: row.name },
      ip,
    });
    return { id: row.code, deleted: true };
  },
};

export default categoryService;