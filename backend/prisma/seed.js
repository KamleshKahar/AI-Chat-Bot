/**
 * Prisma seed entrypoint (`npm run db:seed`).
 *
 * Delegates to the same seed service the `/api/seed/reset` endpoint uses, so
 * there is exactly one definition of the demo dataset.
 */
import 'dotenv/config';
import { prisma } from '../src/config/prisma.js';
import { seedService } from '../src/services/seed.service.js';

try {
  const summary = await seedService.run({ log: console.log });
  console.log('\nSeed summary:', JSON.stringify(summary, null, 2));
} catch (err) {
  console.error('Seed failed:', err);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}