/**
 * Session constants shared by the Next.js BFF layer.
 *
 * The JWT is produced by the REST backend and lives *only* in an httpOnly
 * cookie. It is never returned to client JavaScript, so no XSS can read it.
 * `proxy.js` promotes the cookie to an `Authorization: Bearer` header for
 * every `/api/*` request; the route handlers set and clear it.
 *
 * Server-only: imported by `proxy.js` and the `/api/auth/*` route handlers.
 */

/** Cookie name. Must match on both the set (route handler) and read (proxy) side. */
export const SESSION_COOKIE = 'flowpilot_token';

/**
 * Keep in step with `JWT_EXPIRES_IN` in `backend/.env` (default `8h`).
 * The backend is the real authority — a stale token simply yields a 401.
 */
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 8;

/**
 * Routes reachable without a session.
 *
 * Deliberately defined here and imported by both `proxy.js` (which bounces
 * anonymous visitors away from the app) and `AuthContext` (which must know that
 * having no session on one of these routes is the expected state, not an expiry
 * to recover from). When these were kept separately, `AuthContext` treated the
 * `me()` 401 that `/login` legitimately produces as a dead session and
 * navigated back to `/login`, remounting the root layout and looping forever.
 */
export const PUBLIC_PATHS = new Set(['/login']);

/** True when `pathname` is reachable without a session. */
export function isPublicPath(pathname) {
  return PUBLIC_PATHS.has(pathname);
}

/**
 * Upstream API origin. `serverRuntimeConfig`/`publicRuntimeConfig` were removed
 * in Next 16, so a plain env var is the only mechanism.
 */
export const API_ORIGIN =
  process.env.API_ORIGIN?.replace(/\/+$/, '') || 'http://localhost:4000';

/** Cookie attributes. `secure` is on in production, which is served over HTTPS. */
export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
}
