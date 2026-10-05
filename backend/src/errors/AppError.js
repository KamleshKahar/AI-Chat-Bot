/**
 * Operational error carrying an HTTP status, a stable machine-readable code and
 * optional per-field validation details.
 */
export class AppError extends Error {
  constructor(status, message, { code, details } = {}) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code ?? defaultCodeFor(status);
    this.details = details;
    this.expected = true;
  }

  static badRequest(message = 'Bad request', opts) {
    return new AppError(400, message, opts);
  }

  static unauthorized(message = 'Authentication required', opts) {
    return new AppError(401, message, opts);
  }

  static forbidden(message = 'You do not have permission to perform this action', opts) {
    return new AppError(403, message, opts);
  }

  static notFound(message = 'Resource not found', opts) {
    return new AppError(404, message, opts);
  }

  static conflict(message = 'Resource conflict', opts) {
    return new AppError(409, message, opts);
  }

  /** 422 — validation failed. `details` is keyed by field path. */
  static validation(message = 'Validation failed', details, opts) {
    return new AppError(422, message, { code: 'VALIDATION_FAILED', details, ...opts });
  }
}

function defaultCodeFor(status) {
  const map = {
    400: 'BAD_REQUEST',
    401: 'UNAUTHORIZED',
    403: 'FORBIDDEN',
    404: 'NOT_FOUND',
    409: 'CONFLICT',
    422: 'VALIDATION_FAILED',
    429: 'TOO_MANY_REQUESTS',
  };
  return map[status] ?? 'INTERNAL_ERROR';
}