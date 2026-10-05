import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import swaggerUi from 'swagger-ui-express';

import { env } from './config/env.js';
import apiRoutes from './routes/index.js';
import { errorHandler, notFoundHandler } from './errors/errorHandler.js';
import { requestId } from './middleware/requestId.js';
import { buildOpenApiDocument } from './docs/openapi.js';

export function createApp() {
  const app = express();

  // Behind a reverse proxy, trust X-Forwarded-For so access logs and audit IPs
  // record the real client rather than the proxy.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(requestId);

  app.use(
    cors({
      origin(origin, callback) {
        // Same-origin requests and non-browser clients (curl, the smoke test)
        // arrive without an Origin header — allow those, and require an
        // allow-listed browser origin otherwise.
        if (!origin) return callback(null, true);
        if (env.corsOrigins.includes(origin)) return callback(null, true);

        // Deliberately NOT `callback(new Error(...))`. Throwing hands the
        // decision to Express's error handler, which reports a rejected origin
        // as `500 UNHANDLED` — a server fault for what is only a client-policy
        // decision, and one that reads as "the API is broken". CORS is enforced
        // by the browser anyway: `false` means "omit the CORS headers", so the
        // response is simply unreadable from a disallowed origin. The token
        // check in `middleware/auth.js` remains the real gate.
        console.warn(`[cors] origin not in CORS_ORIGINS, CORS headers omitted: ${origin}`);
        return callback(null, false);
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'x-request-id'],
      exposedHeaders: ['x-request-id'],
    })
  );

  app.use(express.json({ limit: env.JSON_LIMIT }));
  app.use(express.urlencoded({ extended: true, limit: env.JSON_LIMIT }));

  morgan.token('request-id', (req) => req.id ?? '-');
  app.use(
    morgan(':request-id :method :url :status :res[content-length] - :response-time ms', {
      skip: () => env.isTest,
    })
  );

  app.get('/', (req, res) => {
    res.json({
      name: 'FlowPilot Sales & Inventory API',
      version: '1.0.0',
      docs: '/api/docs',
      openapi: '/api/openapi.json',
      health: '/api/health',
    });
  });

  app.use('/api', apiRoutes);

  // OpenAPI spec as JSON, plus a Swagger UI at /api/docs. Both are generated
  // from the same Zod schemas the routes validate against.
  app.get('/api/openapi.json', (req, res) => {
    res.json(buildOpenApiDocument());
  });
  app.use(
    '/api/docs',
    swaggerUi.serve,
    swaggerUi.setup(buildOpenApiDocument(), {
      customSiteTitle: 'FlowPilot API',
    })
  );

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export default createApp;