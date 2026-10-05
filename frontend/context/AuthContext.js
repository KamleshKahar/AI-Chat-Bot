'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { apiGet, apiPost, onSessionExpired } from '@/lib/apiClient';

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
  const router = useRouter();

  const signOutLocally = useCallback((redirectTo = '/login') => {
    setUser(null);
    if (redirectTo) router.push(redirectTo);
  }, [router]);

  // Restore the session on mount. `proxy.js` already redirects anonymous
  // visitors before this runs, so a failure here means the cookie is present
  // but no longer valid — an expired or revoked token.
  useEffect(() => {
    let cancelled = false;

    apiGet('/auth/me')
      .then(({ data }) => {
        if (!cancelled) setUser(data);
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // A 401 from any request anywhere in the app ends the session once.
  useEffect(() => onSessionExpired(() => signOutLocally()), [signOutLocally]);

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
      setUser(data?.user ?? null);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message || 'Unable to sign in. Please try again.' };
    }
  };

  /**
   * Clear the cookie server-side, then drop local state and navigate away.
   *
   * @param {string} [redirectTo] where to land afterwards. Overridable because
   *   some flows need to explain *why* the session ended — see the demo-data
   *   reset, which recreates every user account and therefore invalidates the
   *   caller's own token.
   */
  const logout = async (redirectTo = '/login') => {
    try {
      await apiPost('/auth/logout', {});
    } catch {
      // Even if the backend is unreachable the cookie must be cleared,
      // otherwise the user cannot sign out.
    }
    signOutLocally(redirectTo);
  };

  const value = {
    user,
    isAuthenticated: !!user,
    isLoading,
    login,
    logout,
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
