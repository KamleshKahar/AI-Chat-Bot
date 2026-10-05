import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { getApiOrigin } from '@/lib/apiOrigin';
import { SESSION_COOKIE } from '@/lib/session';

/**
 * BFF logout route.
 *
 * Notifies the backend so the event lands in the audit trail, then clears the
 * cookie. The upstream JWT is stateless — there is no server-side revocation
 * list — so clearing the cookie is what actually ends the session. A failure
 * to reach the backend must not strand the user in a signed-in UI, so the
 * cookie is cleared either way.
 */
export async function POST() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;

  if (token) {
    await fetch(`${getApiOrigin()}/api/auth/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => {
      // Best effort. The session ends client-side regardless.
    });
  }

  cookieStore.delete(SESSION_COOKIE);
  return NextResponse.json({ data: { success: true } });
}
