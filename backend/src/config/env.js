import 'dotenv/config';
import { z } from 'zod';

/**
 * Centralised, validated runtime configuration.
 * Everything the app needs is resolved once, here.
 */
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  /*
   * Allow-listed browser origins, comma separated.
   *
   * 3000 is Next.js' default, but `ai-backend/server.js` binds 3000 in this
   * workspace, so `next dev` runs on 3100 — hence both. 127.0.0.1 is listed
   * alongside localhost because browsers treat them as distinct origins and a
   * request to one from a page served by the other carries the other's value.
   */
  CORS_ORIGINS: z
    .string()
    .default(
      'http://localhost:3000,http://127.0.0.1:3000,http://localhost:3100,http://127.0.0.1:3100'
    ),

  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  JWT_EXPIRES_IN: z.string().default('8h'),

  JSON_LIMIT: z.string().default('1mb'),

  SEED_ADMIN_EMAIL: z.string().email().default('admin@flowpilot.in'),
  SEED_ADMIN_PASSWORD: z.string().min(6).default('flowpilot123'),
  SEED_ADMIN_NAME: z.string().default('Kamlesh Patel'),

  ENABLE_SEED_ENDPOINT: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
    .join('\n');
  // Fail fast and loudly — a half-configured server is worse than no server.
  throw new Error(`Invalid environment configuration:\n${issues}`);
}

export const env = {
  ...parsed.data,
  isProd: parsed.data.NODE_ENV === 'production',
  isTest: parsed.data.NODE_ENV === 'test',
  corsOrigins: parsed.data.CORS_ORIGINS.split(',')
    .map((s) => s.trim())
    .filter(Boolean),
};