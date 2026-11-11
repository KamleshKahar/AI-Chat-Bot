'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  UserCog,
  Package,
  ShoppingCart,
  FileText,
  BarChart3,
  LogOut,
  ChevronRight,
  Layers,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

/**
 * Navigation, filtered by the signed-in user's permissions.
 *
 * Each entry may name a permission from the backend's matrix
 * (`middleware/roles.js`, shipped on `/auth/me` as `permissions`); an entry
 * without one is visible to every role. Hiding is a rendering convenience —
 * the pages and the API behind them enforce the same rules server-side, so a
 * hand-typed URL gets a clear "no access" panel rather than data.
 */
const NAV_ITEMS = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Inventory', href: '/inventory', icon: Package },
  { name: 'Customers', href: '/customers', icon: Users },
  { name: 'Sales & POS', href: '/sales', icon: ShoppingCart },
  { name: 'Invoices', href: '/invoices', icon: FileText },
  { name: 'Reports', href: '/reports', icon: BarChart3, permission: 'report:read' },
  { name: 'Users', href: '/users', icon: UserCog, permission: 'user:read' },
  { name: 'AI Assistant', href: '/chat', icon: Sparkles },
];

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

export function Sidebar({ isOpen, onClose }) {
  const pathname = usePathname();
  const { user, can, logout } = useAuth();

  const visibleItems = NAV_ITEMS.filter((item) => !item.permission || can(item.permission));

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-xs lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={`fixed top-0 left-0 z-40 h-screen w-64 bg-slate-900 text-slate-300 transition-transform duration-300 ease-in-out lg:translate-x-0 flex flex-col justify-between border-r border-slate-800 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div>
          {/* Logo Brand */}
          <div className="h-16 flex items-center justify-between px-6 border-b border-slate-800/80 bg-slate-950/40">
            <Link href="/dashboard" className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold shadow-md shadow-indigo-600/30">
                <Layers className="w-5 h-5" />
              </div>
              <div className="flex flex-col">
                <span className="font-bold text-base text-white tracking-tight leading-tight">
                  FlowPilot
                </span>
                <span className="text-[10px] text-indigo-400 font-medium tracking-wider uppercase">
                  Sales & Inventory
                </span>
              </div>
            </Link>
          </div>

          {/* Navigation Links */}
          <div className="px-3 py-5 space-y-1">
            <div className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Operations
            </div>

            {visibleItems.map((item) => {
              const Icon = item.icon;
              const isActive =
                pathname === item.href ||
                (item.href !== '/dashboard' && pathname.startsWith(item.href));

              return (
                <Link
                  key={item.name}
                  href={item.href}
                  onClick={() => onClose && onClose()}
                  className={`group flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-indigo-600 text-white shadow-xs font-semibold'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon
                      className={`w-4 h-4 transition-colors ${
                        isActive ? 'text-white' : 'text-slate-400 group-hover:text-white'
                      }`}
                    />
                    <span>{item.name}</span>
                  </div>
                  {isActive && <ChevronRight className="w-3.5 h-3.5 text-indigo-200" />}
                </Link>
              );
            })}
          </div>
        </div>

        {/* User Card & Logout Bottom */}
        <div className="p-3 border-t border-slate-800 bg-slate-950/30">
          <div className="flex items-center gap-3 p-2.5 rounded-lg bg-slate-800/60 border border-slate-800/80 mb-2">
            <div className="w-8 h-8 rounded-full bg-indigo-500 text-white flex items-center justify-center font-bold text-xs shrink-0 ring-2 ring-indigo-400/20">
              {monogram(user)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-white truncate">{user?.name || '—'}</p>
              <p className="text-[11px] text-slate-400 truncate">{user?.role || ''}</p>
            </div>
          </div>

          <button
            onClick={logout}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>
    </>
  );
}
