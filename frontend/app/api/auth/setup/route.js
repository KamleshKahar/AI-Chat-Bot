import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { getApiOrigin } from '@/lib/apiOrigin';
import { SESSION_COOKIE, sessionCookieOptions } from '@/lib/session';

/**
 * BFF first-run setup route.
 *
 * Same shape as `/api/auth/login`: the upstream JWT lands in an httpOnly cookie
 * and never touches the response body. The backend only answers 201 while the
 * `users` table is empty, so this route cannot be replayed to mint accounts —
 * by the time a second visitor loads it, upstream has already closed the door.
 */
export async function POST(request) {
  let input;
  try {
    input = await request.json();
  } catch {
    return NextResponse.json(
      { error: { status: 400, message: 'Request body must be valid JSON', code: 'BAD_REQUEST' } },
      { status: 400 }
    );
  }

  const upstream = await fetch(`${getApiOrigin()}/api/auth/setup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: input?.name,
      email: input?.email,
      password: input?.password,
      // Optional second step of the wizard: the company letterhead.
      company: input?.company || undefined,
    }),
  });

  const payload = await upstream.json().catch(() => null);

  if (!upstream.ok || !payload?.data?.token) {
    // Always wrap in `{ error }` — see the note in `login/route.js`. Without
    // the envelope the wizard lost the 422 `details` map and fell back to a
    // generic banner instead of field-keyed errors.
    return NextResponse.json(
      {
        error: payload?.error ?? {
          status: upstream.status,
          message: 'Setup failed',
          code: 'SETUP_FAILED',
        },
      },
      { status: upstream.status }
    );
  }

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, payload.data.token, sessionCookieOptions());

  // Hand back the user only. `token` is deliberately dropped from the body.
  return NextResponse.json({ data: { user: payload.data.user } }, { status: 201 });
}
