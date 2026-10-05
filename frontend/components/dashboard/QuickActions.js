'use client';

import React from 'react';
import Link from 'next/link';
import { ShoppingBag, UserPlus, PackagePlus, FileText, ArrowRight } from 'lucide-react';

export function QuickActions() {
  const actions = [
    { name: 'New Sale / POS', href: '/sales?action=new', icon: ShoppingBag, bg: 'bg-indigo-600 text-white hover:bg-indigo-700' },
    { name: 'Add Product', href: '/inventory?action=add', icon: PackagePlus, bg: 'bg-slate-900 text-white hover:bg-slate-800' },
    { name: 'Add Customer', href: '/customers?action=add', icon: UserPlus, bg: 'bg-emerald-600 text-white hover:bg-emerald-700' },
    { name: 'Invoices', href: '/invoices', icon: FileText, bg: 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50' },
  ];

  return (
    <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-2xs">
      <h3 className="text-sm font-semibold text-slate-800 mb-3.5">Quick Actions</h3>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {actions.map((act) => {
          const Icon = act.icon;
          return (
            <Link
              key={act.name}
              href={act.href}
              className={`flex items-center justify-between p-3 rounded-lg text-xs font-semibold transition-all shadow-2xs ${act.bg}`}
            >
              <div className="flex items-center gap-2">
                <Icon className="w-4 h-4 shrink-0" />
                <span className="truncate">{act.name}</span>
              </div>
              <ArrowRight className="w-3.5 h-3.5 opacity-70 shrink-0" />
            </Link>
          );
        })}
      </div>
    </div>
  );
}
