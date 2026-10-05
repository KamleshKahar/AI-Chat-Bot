/**
 * Wrap an async route handler so a rejected promise reaches Express's error
 * pipeline instead of hanging the request.
 */
export function asyncHandler(fn) {
  return function wrapped(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}