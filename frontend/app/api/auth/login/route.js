import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { getApiOrigin } from '@/lib/apiOrigin';
import { SESSION_COOKIE, sessionCookieOptions } from '@/lib/session';

/**
 * BFF login route.
 *
 * Owns the token lifecycle: the upstream JWT is moved into an httpOnly cookie
 * and is *never* included in the response body, so client JavaScript cannot
 * read it. This replaces the old `localStorage` approach, where any XSS could
 * exfiltrate a token granting access to every customer, invoice and price.
 *
 * A dedicated route handler (rather than a bare rewrite) is required because
 * `httpOnly` cookies can only be set from a Server Function or Route Handler.
 */
export async function POST(request) {
  let credentials;
  try {
    credentials = await request.json();
  } catch {
    return NextResponse.json(
      { error: { status: 400, message: 'Request body must be valid JSON', code: 'BAD_REQUEST' } },
      { status: 400 }
    );
  }

  const upstream = await fetch(`${getApiOrigin()}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: credentials?.email,
      password: credentials?.password,
    }),
  });

  const payload = await upstream.json().catch(() => null);

  if (!upstream.ok || !payload?.data?.token) {
    return NextResponse.json(
      payload?.error ?? {
        error: { status: upstream.status, message: 'Login failed', code: 'LOGIN_FAILED' },
      },
      { status: upstream.status }
    );
  }

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, payload.data.token, sessionCookieOptions());

  // Hand back the user only. `token` is deliberately dropped from the body.
  return NextResponse.json({ data: { user: payload.data.user } });
}
