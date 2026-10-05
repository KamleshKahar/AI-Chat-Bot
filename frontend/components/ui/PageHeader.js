'use client';

import React from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

export function PageHeader({ title, description, breadcrumbs = [], actions }) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        {breadcrumbs.length > 0 && (
          <nav aria-label="Breadcrumb" className="mb-2 flex items-center gap-1 text-xs text-slate-500">
            {breadcrumbs.map((crumb, index) => {
              const isLast = index === breadcrumbs.length - 1;
              return (
                <React.Fragment key={`${crumb.label}-${index}`}>
                  {crumb.href && !isLast ? (
                    <Link
                      href={crumb.href}
                      className="font-medium hover:text-indigo-600 transition-colors"
                    >
                      {crumb.label}
                    </Link>
                  ) : (
                    <span className={isLast ? 'font-semibold text-slate-700' : ''}>{crumb.label}</span>
                  )}
                  {!isLast && <ChevronRight className="h-3 w-3 text-slate-300" />}
                </React.Fragment>
              );
            })}
          </nav>
        )}

        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
        {description && <p className="text-sm text-slate-500 mt-1 max-w-2xl">{description}</p>}
      </div>

      {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}