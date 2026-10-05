'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Menu, Plus, RefreshCw, Bell, ChevronDown, LogOut, UserRound } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useData } from '@/context/DataContext';
import { useToast } from '@/context/ToastContext';
import { useServerResource } from '@/hooks/useServerQuery';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

export function Header({ onMenuClick }) {
  const { user, logout } = useAuth();
  const { resetToDemoData, revision } = useData();
  const { error } = useToast();
  const [resetOpen, setResetOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  /*
    The low-stock bell reads a server-side count rather than a client-side
    collection. `limit: 1` because only the tallies are used here — the alert
    panel on the dashboard asks for the rows it actually shows.
  */
  const { data: alerts } = useServerResource({
    path: '/dashboard/alerts',
    query: { limit: 1 },
    refreshKey: revision,
  });
  const lowStockCount = alerts?.counts?.low_stock ?? 0;

  /**
   * Reset is a real server operation now, not a localStorage rewrite, so it can
   * genuinely fail — ADMIN-only, and refused outright when the seed endpoint is
   * disabled. Reporting success unconditionally here would tell the user their
   * data was restored when it was not.
   *
   * The seed wipes the `users` table along with everything else and recreates
   * the accounts under fresh primary keys, so the JWT this request was made with
   * stops resolving — every subsequent call would 401. The session is therefore
   * ended deliberately, on the way to a login page that explains why, rather
   * than letting the user get bounced by a confusing mid-session 401.
   */
  const handleReset = async () => {
    setResetting(true);
    try {
      await resetToDemoData();
      await logout('/login?reset=1');
    } catch (err) {
      error(
        err.message ||
          'Could not reset the demo data. This action requires an administrator and an enabled seed endpoint.'
      );
      /*
       * Re-thrown on purpose. `ConfirmDialog` only closes when `onConfirm`
       * resolves, so letting this propagate keeps the dialog open on failure —
       * swallowing it here would close the dialog and imply the reset worked.
       */
      throw err;
    } finally {
      setResetting(false);
    }
  };

  return (
    <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between gap-3 border-b border-slate-200 bg-white/95 px-4 backdrop-blur-xs sm:px-6">
      <div className="flex items-center gap-3 min-w-0">
        <button
          onClick={onMenuClick}
          className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:hidden"
          aria-label="Open sidebar"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="hidden items-center gap-2 md:flex">
          <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
            Live Demo
          </span>
          <span className="text-[11px] text-slate-400 font-medium">|</span>
          <span className="text-[11px] text-slate-600 font-medium">
            Currency: <span className="font-semibold text-slate-900">INR (₹)</span>
          </span>
        </div>
      </div>

      {/* Right actions */}
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          icon={RefreshCw}
          onClick={() => setResetOpen(true)}
          className="hidden lg:inline-flex text-xs"
        >
          Reset Demo Data
        </Button>

        <Link href="/sales?action=new">
          <Button variant="primary" size="sm" icon={Plus} className="text-xs">
            <span className="hidden sm:inline">New Sale</span>
            <span className="sm:hidden">New</span>
          </Button>
        </Link>

        {/* Low stock indicator */}
        {lowStockCount > 0 && (
          <Link
            href="/inventory?filter=low_stock"
            className="relative rounded-lg p-2 text-slate-500 hover:bg-slate-100 transition"
            title={`${lowStockCount} item(s) at or below reorder level`}
          >
            <Bell className="w-4 h-4 text-amber-600" />
            <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-amber-500 ring-2 ring-white" />
          </Link>
        )}

        {/* Profile menu */}
        <div className="relative">
          <button
            onClick={() => setMenuOpen((m) => !m)}
            onBlur={() => setTimeout(() => setMenuOpen(false), 150)}
            className="flex items-center gap-2 rounded-lg py-1 pl-1 pr-2 hover:bg-slate-100 transition"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-slate-900 text-[11px] font-semibold text-white">
              {user?.avatar || 'KP'}
            </span>
            <span className="hidden text-left sm:block">
              <span className="block text-xs font-semibold leading-tight text-slate-900">
                {user?.name || 'Administrator'}
              </span>
              <span className="block text-[10px] leading-tight text-slate-500">
                {user?.role || 'Store Administrator'}
              </span>
            </span>
            <ChevronDown className="hidden h-3.5 w-3.5 text-slate-400 sm:block" />
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-full z-40 mt-2 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
              <div className="border-b border-slate-100 px-4 py-3">
                <p className="text-sm font-semibold text-slate-900">{user?.name}</p>
                <p className="truncate text-xs text-slate-500">{user?.email}</p>
                <p className="mt-1.5 inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-700">
                  <UserRound className="h-2.5 w-2.5" />
                  {user?.role}
                </p>
              </div>

              <button
                onClick={() => {
                  setMenuOpen(false);
                  setResetOpen(true);
                }}
                className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50 transition"
              >
                <RefreshCw className="h-4 w-4 text-slate-400" />
                Reset demo data
              </button>

              <button
                onClick={logout}
                className="flex w-full items-center gap-2 border-t border-slate-100 px-4 py-2.5 text-left text-sm text-rose-600 hover:bg-rose-50 transition"
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        isOpen={resetOpen}
        onClose={() => setResetOpen(false)}
        onConfirm={handleReset}
        loading={resetting}
        variant="danger"
        title="Reset all demo data?"
        message="This permanently deletes every customer, product, sale, invoice and ledger entry in the database, then re-seeds the original sample dataset. It requires an administrator account and cannot be undone."
        confirmText="Reset Data"
        cancelText="Keep My Data"
      />
    </header>
  );
}