import { NextResponse } from 'next/server';
import { SESSION_COOKIE } from './lib/session.js';

/**
 * Backend-for-frontend boundary.
 *
 * Two jobs, both server-side, so the JWT never reaches the browser's JS:
 *
 *  1. Lift the httpOnly session cookie into an `Authorization: Bearer` header
 *     for every proxied `/api/*` request. The `afterFiles` rewrite in
 *     `next.config.mjs` forwards `/api/:path*` to the backend, and Next.js
 *     forwards request headers to rewrite destinations.
 *  2. Optimistically redirect unauthenticated page visits away from the app.
 *
 * Neither job is the security boundary. Job 2 only checks that a cookie is
 * *present*; it never verifies the JWT. Every protected operation is
 * authorized server-side by `backend/src/middleware/roles.js`, which is the
 * real gate. A tampered cookie gets bounced here and 401'd by the API.
 */

/** Routes reachable without a session. */
const PUBLIC_PATHS = new Set(['/login']);

/** `/api/*` requests are authenticated by the header lift, not the redirect. */
const isApiRequest = (pathname) =>
  pathname === '/api' || pathname.startsWith('/api/');

export function proxy(request) {
  const { pathname, search } = request.nextUrl;
  const token = request.cookies.get(SESSION_COOKIE)?.value;

  // --- API traffic: promote cookie -> bearer header -----------------------
  if (isApiRequest(pathname)) {
    if (!token) return NextResponse.next();

    const headers = new Headers(request.headers);
    headers.set('authorization', `Bearer ${token}`);
    return NextResponse.next({ request: { headers } });
  }

  // --- Page navigation: optimistic auth redirect --------------------------
  const isPublic = PUBLIC_PATHS.has(pathname);

  // Already signed in but sitting on the login page — send them to the app.
  if (isPublic && token) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  // No session and not on a public route — bounce to login, preserving the
  // intended destination so the user lands where they meant to go.
  if (!isPublic && !token) {
    const loginUrl = new URL('/login', request.url);
    if (pathname !== '/') {
      loginUrl.search = `?next=${encodeURIComponent(pathname + search)}`;
    }
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match page routes and /api/*, but not static assets. Without this the
     * proxy would also intercept /_next/static, /favicon.ico and images, and
     * an unauthenticated visitor would have CSS and JS blocked as well.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
