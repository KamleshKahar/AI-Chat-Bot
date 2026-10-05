'use client';

import React from 'react';

export function Card({ title, description, actions, children, className = '', bodyClassName = '', padded = true }) {
  return (
    <div className={`bg-white rounded-xl border border-slate-200/80 shadow-2xs ${className}`}>
      {(title || actions) && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-4 border-b border-slate-100">
          <div>
            {title && <h3 className="text-base font-semibold text-slate-900">{title}</h3>}
            {description && <p className="text-xs text-slate-500 mt-0.5">{description}</p>}
          </div>
          {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
        </div>
      )}
      <div className={padded ? `p-5 ${bodyClassName}` : bodyClassName}>{children}</div>
    </div>
  );
}

export function StatCard({ label, value, hint, icon: Icon, tone = 'slate' }) {
  const tones = {
    slate: 'text-slate-700 bg-slate-100',
    indigo: 'text-indigo-700 bg-indigo-50',
    emerald: 'text-emerald-700 bg-emerald-50',
    amber: 'text-amber-700 bg-amber-50',
    rose: 'text-rose-700 bg-rose-50',
    sky: 'text-sky-700 bg-sky-50',
  };

  return (
    <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-2xs">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 truncate">
            {label}
          </p>
          <p className="mt-1.5 text-xl font-bold tracking-tight text-slate-900 truncate">{value}</p>
          {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
        </div>
        {Icon && (
          <div className={`shrink-0 rounded-lg p-2 ${tones[tone] || tones.slate}`}>
            <Icon className="h-4 w-4" />
          </div>
        )}
      </div>
    </div>
  );
}