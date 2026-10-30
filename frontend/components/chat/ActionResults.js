'use client';

import React from 'react';
import Link from 'next/link';
import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';

/**
 * Map a FlowPilot entity code to a page that can show it.
 *
 * The API exposes human codes as `id`, and the invoice detail route resolves
 * both `INV-…` and `SALE-…` codes (`invoiceRepo.resolve`), so a recorded sale
 * links to the same detail screen as its invoice.
 */
function hrefFor(id) {
  if (typeof id !== 'string') return null;
  if (id.startsWith('INV-') || id.startsWith('SALE-')) return `/invoices/${encodeURIComponent(id)}`;
  if (id.startsWith('PRD-')) return '/inventory';
  if (id.startsWith('CUST-')) return '/customers';
  return null;
}

/** Pull the created/updated entity out of a successful result, if there is one. */
function entityLink(result) {
  const entity = result?.result?.data?.data;
  if (!entity || typeof entity !== 'object' || Array.isArray(entity)) return null;
  const href = hrefFor(entity.id);
  return href ? { href, id: entity.id } : null;
}

/**
 * Per-action outcome of an executed plan.
 *
 * A failure halts the chain server-side (later actions may depend on earlier
 * results), so a short `results` array is itself information: it is rendered
 * as "stopped at step N of M" rather than silently implying everything ran.
 */
export function ActionResults({ results = [], totalActions }) {
  if (!Array.isArray(results) || results.length === 0) return null;

  const succeeded = results.filter((item) => item?.success).length;
  const planned = Number.isInteger(totalActions) && totalActions >= results.length ? totalActions : results.length;
  const stopped = succeeded < planned;

  return (
    <div className="mt-2 rounded-xl border border-slate-200 bg-white shadow-2xs overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-b border-slate-100">
        <span className="text-sm font-semibold text-slate-800">Results</span>
        <span className="text-xs text-slate-500">
          {succeeded} of {planned} step{planned === 1 ? '' : 's'} completed
        </span>
      </div>

      <ol className="divide-y divide-slate-100">
        {results.map((item, index) => {
          const link = item?.success ? entityLink(item) : null;
          return (
            <li key={index} className="px-4 py-3 flex items-start gap-3">
              <span className="shrink-0 mt-0.5">
                {item?.success ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                ) : (
                  <XCircle className="w-4 h-4 text-rose-500" />
                )}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-slate-400">{index + 1}.</span>
                  <code className="text-xs text-slate-700 font-mono break-all">
                    {item?.action?.method} {item?.action?.endpoint}
                  </code>
                  {link && (
                    <Link
                      href={link.href}
                      className="text-[11px] font-medium text-indigo-600 hover:text-indigo-800 hover:underline"
                    >
                      View {link.id} →
                    </Link>
                  )}
                </div>
                {!item?.success && item?.error && (
                  <p className="text-xs text-rose-600 mt-1">
                    {item.error.message || 'Request failed'}
                    {item.error.status ? ` (HTTP ${item.error.status})` : ''}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {stopped && (
        <div className="px-4 py-2.5 bg-amber-50 border-t border-amber-100 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-800">
            Execution stopped at step {succeeded + 1} of {planned} — a failed action halts the
            rest, so later steps were not run. Earlier steps above have already been applied
            and cannot be rolled back automatically.
          </p>
        </div>
      )}
    </div>
  );
}
