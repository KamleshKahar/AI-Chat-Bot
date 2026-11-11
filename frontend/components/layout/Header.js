'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Menu, Plus, Bell, ChevronDown, LogOut, UserRound, KeyRound } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useData } from '@/context/DataContext';
import { useServerResource } from '@/hooks/useServerQuery';
import { Button } from '@/components/ui/Button';
import { ChangePasswordModal } from '@/components/users/ChangePasswordModal';

/** Two-letter monogram from a display name; falls back to the email local part. */
function monogram(user) {
  const source = (user?.name || user?.email || '?').trim();
  return (
    source
      .split(/\s+/)
      .map((part) => part[0])
      .slice(0, 2)
      .join('')
      .toUpperCase() || '?'
  );
}

export function Header({ onMenuClick }) {
  const { user, can, logout, changePassword } = useAuth();
  const { revision } = useData();
  const [menuOpen, setMenuOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);

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
          <span className="text-[11px] text-slate-600 font-medium">
            Currency: <span className="font-semibold text-slate-900">INR (₹)</span>
          </span>
        </div>
      </div>

      {/* Right actions */}
      <div className="flex items-center gap-2">
        {/* Gated like every other create action: a viewer has no `sale:create`. */}
        {can('sale:create') && (
          <Link href="/sales?action=new">
            <Button variant="primary" size="sm" icon={Plus} className="text-xs">
              <span className="hidden sm:inline">New Sale</span>
              <span className="sm:hidden">New</span>
            </Button>
          </Link>
        )}

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
              {monogram(user)}
            </span>
            <span className="hidden text-left sm:block">
              <span className="block text-xs font-semibold leading-tight text-slate-900">
                {user?.name || '—'}
              </span>
              <span className="block text-[10px] leading-tight text-slate-500">
                {user?.role || ''}
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
                  setPasswordOpen(true);
                }}
                className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50 transition"
              >
                <KeyRound className="h-4 w-4 text-slate-400" />
                Change password
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

      <ChangePasswordModal
        isOpen={passwordOpen}
        onClose={() => setPasswordOpen(false)}
        onChange={changePassword}
      />
    </header>
  );
}
