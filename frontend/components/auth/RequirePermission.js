'use client';

import React from 'react';
import Link from 'next/link';
import { ShieldAlert, LayoutDashboard } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/Button';

/**
 * Client-side permission gate for a whole page.
 *
 * The backend is the real gate — every route behind this renders only after
 * `requirePermission` passed upstream. This exists so a stale bookmark, a
 * role change mid-session, or a direct URL typed by a curious user lands on a
 * clear explanation instead of a wall of 403 toasts from the page's own
 * queries.
 *
 * `permission` is a single string from `middleware/roles.js`'s matrix, which
 * `/auth/me` ships as the user's `permissions` array.
 */
export function RequirePermission({ permission, children }) {
  const { can, user } = useAuth();

  if (can(permission)) return children;

  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="text-center max-w-md">
        <div className="w-14 h-14 rounded-2xl bg-rose-50 border border-rose-100 flex items-center justify-center mx-auto mb-4">
          <ShieldAlert className="w-7 h-7 text-rose-600" />
        </div>
        <h2 className="text-lg font-bold text-slate-900">You don&apos;t have access to this page</h2>
        <p className="text-sm text-slate-500 mt-2 leading-relaxed">
          Your account role (<span className="font-semibold">{user?.role ?? 'unknown'}</span>) does
          not include the <code className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded">{permission}</code>{' '}
          permission. Ask an administrator if you believe you need it.
        </p>
        <Link href="/dashboard" className="inline-block mt-6">
          <Button variant="primary" icon={LayoutDashboard}>
            Back to Dashboard
          </Button>
        </Link>
      </div>
    </div>
  );
}
