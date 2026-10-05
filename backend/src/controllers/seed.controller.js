import { seedService } from '../services/seed.service.js';
import { env } from '../config/env.js';
import { AppError } from '../errors/AppError.js';

export const seedController = {
  /**
   * Re-seed the demo dataset.
   *
   * Disabled unless ENABLE_SEED_ENDPOINT=true, and ADMIN-only even then — this
   * endpoint destroys every row, so it must never be reachable from a deployed
   * environment by accident.
   */
  async reset(req, res) {
    if (!env.ENABLE_SEED_ENDPOINT) {
      throw AppError.notFound('Seed endpoint is disabled');
    }

    const summary = await seedService.run({ log: () => {} });
    res.json({ data: { ...summary, seeded: true } });
  },
};

export default seedController;