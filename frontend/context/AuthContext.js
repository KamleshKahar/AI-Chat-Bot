'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { apiGet, apiPost, onSessionExpired, resetSessionExpiryGuard } from '@/lib/apiClient';
import { isPublicPath } from '@/lib/session';

/**
 * Server-backed authentication.
 *
 * The old implementation compared the password against a hardcoded string and
 * cached the user object in `localStorage` — no backend, no token, so every
 * protected endpoint would have 401'd the moment the API was wired in.
 *
 * The JWT now lives in an httpOnly cookie owned by the BFF route handlers in
 * `app/api/auth/*`. Nothing here ever sees or stores it.
 */

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const pathname = usePathname();

  /**
   * `AuthProvider` sits in the root layout, so it mounts on `/login` too. Having
   * no session there is the expected state — not an expiry to recover from.
   *
   * Getting this wrong is not cosmetic. `endSession` clears the cookie and hard
   * navigates; on a public route that produced an infinite loop, because the
   * `me()` 401 that `/login` legitimately returns sent the app back to `/login`,
   * which remounted the root layout, which called `me()` again. Ten cycles per
   * five seconds, observed on the wire.
   */
  const onPublicRoute = isPublicPath(pathname);

  /**
   * Whether a 401 has already put the session on its way out.
   *
   * `apiClient` dispatches the expiry event synchronously before it throws, so
   * by the time the mount-time `catch` below runs this is already `true` and a
   * second teardown is skipped. A failure that is *not* a 401 — the backend
   * being unreachable — dispatches nothing, and the user still cannot continue,
   * so the flag is what tells the two cases apart. Reset whenever a session is
   * established, so it cannot go stale across a sign-out and sign-in.
   */
  const expiryHandled = useRef(false);

  /**
   * Latches once a teardown starts, so a second call cannot clobber the first.
   *
   * Two teardowns racing is not hypothetical: the generic 401 expiry path fires
   * while the caller's own `await logout()` is still in flight, so the expiry
   * navigates first and a frame later the explicit logout navigates *over the
   * top of it*. `location.replace` is not queued behind the first call; the
   * second wins. Latching makes the first teardown the only one.
   */
  const tearingDown = useRef(false);

  /**
   * Tear down the session: drop local state, clear the cookie, then leave.
   *
   * Clearing the cookie is not optional, and this is the fix for a permanently
   * blank app. A 401 means the cookie is present but worthless — expired,
   * revoked, or an account an administrator has deactivated. `proxy.js` only
   * checks that a cookie *exists*, so a dead cookie is still waved through into
   * the dashboard on every reload, where `me()` 401s again and the layout
   * renders nothing. Without clearing it there is no way out but the cookie jar.
   *
   * The cookie is httpOnly, so this module cannot delete it any other way — it
   * has to go through the BFF route, which clears it whether or not the backend
   * acknowledges.
   *
   * The navigation is a hard `location.replace`, not `router.push`. An
   * in-flight client transition can reconcile the URL back to the protected
   * page after the push (observed as a `replaceState` to `/dashboard` landing
   * *after* the expiry event), which strands the user on a blank screen.
   * `location.replace` tears the whole app down, so nothing can clobber it, and
   * `replace` keeps the dead page out of the back history.
   *
   * Always lands on `/login`. (This used to accept a caller-chosen destination
   * for the demo-data reset; with that gone, a parameter here would only be a
   * footgun — `onClick={logout}` passes the click event as the first argument.)
   */
  const endSession = useCallback(async () => {
    if (tearingDown.current) return;
    tearingDown.current = true;

    setUser(null);

    try {
      await apiPost('/auth/logout', {});
    } catch {
      // Best effort. The cookie is cleared by the route handler regardless, and
      // the hard navigation below ends the UI session either way.
    }

    // Never navigate when there is nowhere to escape to. On a public route the
    // caller is already where they need to be, and navigating to `/login` from
    // `/login` reloads the root layout, re-running the `me()` check that
    // triggered this in the first place. That is a redirect loop, and it is
    // exactly what a hard navigation turns a harmless self-push into.
    //
    // Both bail-outs must *release* the latch: a teardown that never happened
    // must not block the next one. Leaving it set here is exactly how sign-out
    // died — a 401 while still on `/login` latched the guard, no navigation
    // followed to reload the refs, and every later `logout()` returned at the
    // top of this function without doing anything.
    if (typeof window === 'undefined' || isPublicPath(window.location.pathname)) {
      tearingDown.current = false;
      return;
    }

    window.location.replace('/login');
  }, []);

  // Restore the session on mount. `proxy.js` already redirects anonymous
  // visitors before this runs, so a failure here means the cookie is present
  // but no longer valid — an expired or revoked token. That is a dead end, not
  // a signed-out visitor, so it ends the session rather than sitting in a null
  // state that renders nothing.
  useEffect(() => {
    // On `/login` there is nothing to restore, and asking produces a 401 that
    // would look identical to a real expiry. Skip it and report "not signed in".
    if (onPublicRoute) {
      expiryHandled.current = false;
      setUser(null);
      setIsLoading(false);
      return undefined;
    }

    let cancelled = false;

    apiGet('/auth/me')
      .then(({ data }) => {
        if (cancelled) return;
        // A live session is the strongest evidence that any earlier teardown
        // was spurious — clear both guards so it cannot outlive this restore.
        // The setup wizard establishes the session without going through
        // `login()`, so this is the only reset point it ever gets.
        expiryHandled.current = false;
        tearingDown.current = false;
        resetSessionExpiryGuard();
        setUser(data);
      })
      .catch(() => {
        if (cancelled) return;
        setUser(null);
        // A 401 already dispatched the expiry event, which lands here. This
        // covers a failure that is not a 401 — the backend being down, say —
        // where the user genuinely cannot continue either.
        if (!expiryHandled.current) endSession();
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [endSession, onPublicRoute]);

  // A 401 from any request anywhere in the app ends the session once.
  useEffect(() => {
    const off = onSessionExpired(() => {
      expiryHandled.current = true;
      endSession();
    });
    return off;
  }, [endSession]);

  /**
   * Exchange credentials for a session cookie.
   *
   * Now async, because it performs a real round-trip. `login/page.js` is the
   * only caller and already guards against double submits with a loading
   * state.
   *
   * @returns {Promise<{ success: boolean, error?: string }>}
   */
  const login = async (email, password) => {
    if (!email || !password) {
      return { success: false, error: 'Please enter both email and password.' };
    }

    try {
      const { data } = await apiPost('/auth/login', {
        email: email.trim(),
        password,
      });
      expiryHandled.current = false;
      tearingDown.current = false;
      resetSessionExpiryGuard();
      setUser(data?.user ?? null);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message || 'Unable to sign in. Please try again.' };
    }
  };

  /**
   * Sign out at the user's request.
   *
   * Takes no arguments on purpose: `endSession` always lands on `/login`, and
   * `onClick={logout}` in the sidebar and header would otherwise pass the click
   * event straight through as a redirect target.
   */
  const logout = useCallback(() => endSession(), [endSession]);

  /**
   * Change the signed-in user's own password.
   *
   * Deliberately *not* an admin-style reset: the caller proves they know the
   * current password, which is why no ADMIN permission is involved.
   *
   * @returns {Promise<{ success: boolean, error?: string }>}
   */
  const changePassword = async (currentPassword, newPassword) => {
    try {
      await apiPost('/auth/change-password', { currentPassword, newPassword });
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message || 'Could not change the password.' };
    }
  };

  /**
   * The permission list the signed-in user's role grants, straight from the
   * backend's `middleware/roles.js` — never assembled client-side, so the UI
   * and the API can never disagree about what a role may do. The backend
   * re-checks every request regardless: this gates *rendering*, not security.
   */
  const permissions = user?.permissions ?? [];

  const can = useCallback(
    (permission) => permissions.includes(permission),
    [permissions]
  );

  const value = {
    user,
    isAuthenticated: !!user,
    isLoading,
    permissions,
    can,
    login,
    logout,
    changePassword,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
