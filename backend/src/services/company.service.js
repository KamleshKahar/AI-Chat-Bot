import { companyRepo } from '../repositories/company.repo.js';
import { auditRepo } from '../repositories/audit.repo.js';
import { serializeCompany } from '../serializers/index.js';

export const companyService = {
  async get() {
    return serializeCompany(await companyRepo.get());
  },

  async update(data, actor, { ip } = {}) {
    const before = await companyRepo.get();
    const after = await companyRepo.update(data);
    await auditRepo.write({
      actorUserId: actor?.id ?? null,
      action: 'UPDATE',
      entityType: 'company_profile',
      entityId: String(after.id),
      before: { name: before.name, gstin: before.gstin },
      after: { name: after.name, gstin: after.gstin },
      ip,
    });
    return serializeCompany(after);
  },
};

export default companyService;