import { env } from './config/env.js';
import { prisma } from './config/prisma.js';
import { createApp } from './app.js';
import { logger } from './lib/logger.js';

async function main() {
  // Fail fast with a clear message if the database is unreachable, rather than
  // surfacing the problem as a confusing error on the first request.
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (err) {
    logger.error(`Cannot reach the database: ${err.message}`);
    logger.error('Check DATABASE_URL and that the MySQL server is running.');
    process.exit(1);
  }

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    logger.info(`FlowPilot API listening on http://localhost:${env.PORT}`);
    logger.info(`  Swagger UI   http://localhost:${env.PORT}/api/docs`);
    logger.info(`  OpenAPI JSON http://localhost:${env.PORT}/api/openapi.json`);
    logger.info(`  CORS origins ${env.corsOrigins.join(', ')}`);
  });

  const shutdown = (signal) => {
    logger.info(`${signal} received — shutting down.`);
    server.close(async () => {
      await prisma.$disconnect();
      process.exit(0);
    });
    // Do not let a hung connection block the shutdown forever.
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.error(`Fatal startup error: ${err?.stack ?? err}`);
  process.exit(1);
});