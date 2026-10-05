'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowUpRight, ArrowDownRight, ArrowRight } from 'lucide-react';

/**
 * Headline metric tile.
 *
 * `loading` dims the value rather than unmounting the card, so the dashboard
 * keeps its layout while the summary request is in flight instead of collapsing
 * and reflowing.
 */
export function OverviewCard({
  title,
  value,
  hint,
  change,
  changeType = 'positive',
  icon: Icon,
  color = 'indigo',
  href,
  loading = false,
}) {
  const colorMap = {
    indigo: 'bg-indigo-50 text-indigo-600 border-indigo-100',
    emerald: 'bg-emerald-50 text-emerald-600 border-emerald-100',
    amber: 'bg-amber-50 text-amber-600 border-amber-100',
    rose: 'bg-rose-50 text-rose-600 border-rose-100',
    sky: 'bg-sky-50 text-sky-600 border-sky-100',
    purple: 'bg-purple-50 text-purple-600 border-purple-100',
  };

  const body = (
    <>
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
          {title}
        </span>
        {Icon && (
          <div className={`p-2.5 rounded-lg border ${colorMap[color] || colorMap.indigo}`}>
            <Icon className="w-5 h-5" />
          </div>
        )}
      </div>

      <div className="mt-3 flex items-baseline justify-between gap-2">
        <div className="text-2xl font-bold text-slate-900 tracking-tight">{value}</div>
        {href && (
          <ArrowRight className="w-4 h-4 text-slate-300 shrink-0" aria-hidden="true" />
        )}
      </div>

      {hint && <div className="mt-1.5 text-xs text-slate-500">{hint}</div>}

      {change && (
        <div className="mt-3 flex items-center gap-1 text-xs font-medium">
          {changeType === 'positive' ? (
            <span className="inline-flex items-center text-emerald-600">
              <ArrowUpRight className="w-3.5 h-3.5 mr-0.5" />
              {change}
            </span>
          ) : (
            <span className="inline-flex items-center text-rose-600">
              <ArrowDownRight className="w-3.5 h-3.5 mr-0.5" />
              {change}
            </span>
          )}
          <span className="text-slate-400">vs last month</span>
        </div>
      )}
    </>
  );

  const className =
    'block bg-white p-5 rounded-xl border border-slate-200/80 shadow-2xs transition-all duration-200';
  const stateClass = loading ? 'opacity-60' : href ? 'hover:shadow-md hover:border-indigo-200' : '';

  return href ? (
    <Link href={href} className={`${className} ${stateClass}`}>
      {body}
    </Link>
  ) : (
    <div className={`${className} ${stateClass}`}>{body}</div>
  );
}