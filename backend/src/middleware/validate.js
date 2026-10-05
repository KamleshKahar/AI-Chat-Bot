import { AppError } from '../errors/AppError.js';

/**
 * Zod validation middleware.
 *
 * On success the *parsed* value replaces the raw input, so downstream handlers
 * only ever see coerced, trimmed, schema-conformant data. Query params are read
 * from `req.validated.query`, body from `req.validated.body`.
 */
export function validate({ body, query, params }) {
  return function validateMiddleware(req, res, next) {
    req.validated = req.validated ?? {};

    for (const [key, schema, source] of [
      ['body', body, req.body],
      ['query', query, req.query],
      ['params', params, req.params],
    ]) {
      if (!schema) continue;
      const result = schema.safeParse(source ?? {});
      if (!result.success) {
        const details = {};
        for (const issue of result.error.issues) {
          const field = issue.path.join('.') || '_';
          // First error per field wins; that is what the user needs to see.
          if (!details[field]) details[field] = issue.message;
        }
        return next(
          AppError.validation(
            `Invalid ${key}`,
            details,
            { code: key === 'body' ? 'VALIDATION_FAILED' : 'INVALID_QUERY' }
          )
        );
      }
      req.validated[key] = result.data;
    }

    return next();
  };
}

/** Convenience accessors. */
export const vBody = (req) => req.validated.body;
export const vQuery = (req) => req.validated.query;
export const vParams = (req) => req.validated.params;