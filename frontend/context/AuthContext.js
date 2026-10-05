'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { apiGet, apiPost, onSessionExpired } from '@/lib/apiClient';
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

export const DEMO_CREDENTIALS = {
  email: 'admin@flowpilot.in',
  password: 'flowpilot123',
};

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
   * Where the next teardown should land, when the caller knows better than the
   * default.
   *
   * The demo-data reset is the case that needs this. It recreates every user
   * account, so the caller's own token stops resolving *while `resetToDemoData`
   * is still in flight* — the generic session-expiry teardown fires first, with
   * no knowledge of why, and lands on a bare `/login` with no explanation. The
   * reset needs to reach `/login?reset=1`, which carries a banner saying the
   * data was restored. Declaring the destination first means whichever teardown
   * wins still gets it there.
   */
  const pendingRedirect = useRef(null);

  /**
   * Latches once a teardown starts, so a second call cannot clobber the first.
   *
   * Two teardowns racing is not hypothetical: the demo-data reset invalidates the
   * session *during* `resetToDemoData()`, so the generic expiry path fires and
   * navigates to `/login?reset=1` — and then `await logout()` runs a frame later
   * and navigates to plain `/login` over the top of it. `location.replace` is
   * not queued behind the first call; the second wins, and the banner explaining
   * what happened is lost. Latching makes the first teardown the only one.
   */
  const tearingDown = useRef(false);

  const planSessionEnd = useCallback((redirectTo) => {
    pendingRedirect.current = redirectTo;
  }, []);

  /**
   * Tear down the session: drop local state, clear the cookie, then leave.
   *
   * Clearing the cookie is not optional, and this is the fix for a permanently
   * blank app. A 401 means the cookie is present but worthless — expired,
   * revoked, or an account that has been recreated (the demo-data reset does
   * exactly that). `proxy.js` only checks that a cookie *exists*, so a dead
   * cookie is still waved through into the dashboard on every reload, where
   * `me()` 401s again and the layout renders nothing. Without clearing it
   * there is no way out but the cookie jar.
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
   */
  const endSession = useCallback(
    async (redirectTo) => {
      if (tearingDown.current) return;
      tearingDown.current = true;

      const target = redirectTo ?? pendingRedirect.current ?? '/login';
      pendingRedirect.current = null;

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
      if (typeof window === 'undefined') return;
      if (!target || isPublicPath(window.location.pathname)) return;
      if (target === `${window.location.pathname}${window.location.search}`) return;

      window.location.replace(target);
    },
    []
  );

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
        expiryHandled.current = false;
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
      pendingRedirect.current = null;
      setUser(data?.user ?? null);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message || 'Unable to sign in. Please try again.' };
    }
  };

  /**
   * Sign out at the user's request.
   *
   * @param {string} [redirectTo] where to land afterwards. Usually declared in
   *   advance with `planSessionEnd` instead, when something else will invalidate
   *   the session first — see the demo-data reset, which recreates every user
   *   account and therefore kills the caller's own token mid-request.
   */
const logout = useCallback((redirectTo) => {
    if (redirectTo) pendingRedirect.current = redirectTo;
    return endSession(redirectTo);
  }, [endSession]);

  const value = {
    user,
    isAuthenticated: !!user,
    isLoading,
    login,
    logout,
    planSessionEnd,
    demoCredentials: DEMO_CREDENTIALS,
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
