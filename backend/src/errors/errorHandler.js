import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { AppError } from './AppError.js';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';

/**
 * Single global error handler. Nothing internal ever reaches the client: stack
 * traces and driver messages are logged server-side and replaced with a generic
 * message.
 */
// eslint-disable-next-line no-unused-vars -- Express identifies handlers by arity
export function errorHandler(err, req, res, next) {
  const requestId = req.id ?? '-';

  if (err instanceof AppError) {
    logger.warn(`${requestId} ${err.status} ${err.code} ${req.method} ${req.originalUrl} — ${err.message}`);
    return res.status(err.status).json({
      error: {
        status: err.status,
        code: err.code,
        message: err.message,
        ...(err.details ? { details: err.details } : {}),
      },
    });
  }

  // Zod issues that escaped an explicit validate() call.
  if (err instanceof ZodError) {
    const details = {};
    for (const issue of err.issues) {
      details[issue.path.join('.') || '_'] = issue.message;
    }
    return res.status(422).json({
      error: {
        status: 422,
        code: 'VALIDATION_FAILED',
        message: 'Validation failed',
        details,
      },
    });
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    // Only a genuine uniqueness violation is a client-visible conflict. Every
    // other "known" Prisma error (failed raw query, missing row, lost
    // connection) is a defect or an outage on our side, and reporting those as
    // 409 tells the client to retry a request that can never succeed — while
    // hiding a real bug behind a plausible status code.
    if (err.code === 'P2002') {
      const target = Array.isArray(err.meta?.target)
        ? err.meta.target.join(', ')
        : err.meta?.target;
      return res.status(409).json({
        error: {
          status: 409,
          code: 'DUPLICATE_VALUE',
          message: target
            ? `A record with that ${target} already exists`
            : 'A record with those values already exists',
          ...(target ? { details: { [target]: 'Must be unique' } } : {}),
        },
      });
    }

    if (err.code === 'P2025') {
      return res.status(404).json({
        error: { status: 404, code: 'NOT_FOUND', message: 'Record not found' },
      });
    }

    logger.error(`${requestId} PRISMA_${err.code} ${req.method} ${req.originalUrl} — ${err.message}`);
    return res.status(500).json({
      error: { status: 500, code: 'DATABASE_ERROR', message: 'Internal server error' },
    });
  }

  if (err instanceof Prisma.PrismaClientValidationError) {
    logger.error(`${requestId} PRISMA_VALIDATION ${err.message}`);
    return res.status(500).json({
      error: { status: 500, code: 'INTERNAL_ERROR', message: 'Internal server error' },
    });
  }

  if (err instanceof SyntaxError && 'body' in err) {
    return res.status(400).json({
      error: { status: 400, code: 'MALFORMED_JSON', message: 'Request body is not valid JSON' },
    });
  }

  logger.error(
    `${requestId} UNHANDLED ${req.method} ${req.originalUrl} — ${err?.stack ?? err}`
  );

  return res.status(500).json({
    error: {
      status: 500,
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
      ...(env.isProd ? {} : { debug: String(err?.message ?? err) }),
    },
  });
}

/** 404 for unmatched routes. */
export function notFoundHandler(req, res) {
  res.status(404).json({
    error: {
      status: 404,
      code: 'ROUTE_NOT_FOUND',
      message: `No route matches ${req.method} ${req.originalUrl}`,
    },
  });
}