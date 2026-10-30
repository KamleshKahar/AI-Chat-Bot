'use client';

import React from 'react';
import { Check, CheckCircle2, Loader2, ShieldAlert, X, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';

const METHOD_STYLES = {
  GET: 'bg-sky-50 text-sky-700 border-sky-200',
  POST: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  PUT: 'bg-amber-50 text-amber-700 border-amber-200',
  PATCH: 'bg-amber-50 text-amber-700 border-amber-200',
  DELETE: 'bg-rose-50 text-rose-700 border-rose-200',
};

/** Once a decision is made the buttons are replaced by one of these — the card is latched. */
const STATUS_META = {
  running: { text: 'Executing — please wait…', icon: Loader2, className: 'text-indigo-600' },
  confirmed: { text: 'Executed', icon: CheckCircle2, className: 'text-emerald-600' },
  cancelled: { text: 'Cancelled — nothing was executed', icon: X, className: 'text-slate-500' },
  failed: { text: 'Execution failed', icon: XCircle, className: 'text-rose-600' },
};

function hasContent(value) {
  return value && typeof value === 'object' && Object.keys(value).length > 0;
}

/**
 * The confirmation gate, rendered as a reviewable plan.
 *
 * Every action is shown with its method, endpoint, and reason so the user
 * approves exactly what will run — this card is the entire safety story of the
 * AI assistant, so nothing is collapsed away by default. Once confirmed or
 * cancelled the buttons are removed permanently for that card; a second click
 * can never re-fire the same plan.
 */
export function PlanCard({ plan, status = 'pending', onConfirm, onCancel }) {
  const actions = Array.isArray(plan?.actions) ? plan.actions : [];
  const destructive = actions.some((action) => action?.method === 'DELETE');
  const meta = STATUS_META[status] || null;

  return (
    <div className="mt-2 rounded-xl border border-slate-200 bg-white shadow-2xs overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-b border-slate-100">
        <div className="flex items-center gap-2 min-w-0">
          <ShieldAlert className="w-4 h-4 text-amber-500 shrink-0" />
          <span className="text-sm font-semibold text-slate-800">Proposed actions</span>
          {plan?.intent && (
            <span className="text-[10px] uppercase tracking-wide font-medium text-slate-500 bg-white border border-slate-200 rounded px-1.5 py-0.5 truncate">
              {String(plan.intent).replace(/_/g, ' ')}
            </span>
          )}
        </div>
        <span className="text-xs text-slate-500 shrink-0">
          {actions.length} step{actions.length === 1 ? '' : 's'}
        </span>
      </div>

      <ol className="divide-y divide-slate-100">
        {actions.map((action, index) => {
          const showDetails = hasContent(action?.parameters) || hasContent(action?.body);
          return (
            <li key={index} className="px-4 py-3 flex items-start gap-3">
              <span className="text-xs font-bold text-slate-400 mt-1 w-5 text-right shrink-0">
                {index + 1}.
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                      METHOD_STYLES[action?.method] || 'bg-slate-50 text-slate-600 border-slate-200'
                    }`}
                  >
                    {action?.method}
                  </span>
                  <code className="text-xs text-slate-700 font-mono break-all">
                    {action?.endpoint}
                  </code>
                  {action?.requiresConfirmation && (
                    <span className="text-[10px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
                      needs confirmation
                    </span>
                  )}
                </div>
                {action?.reason && (
                  <p className="text-xs text-slate-500 mt-1">{action.reason}</p>
                )}
                {showDetails && (
                  <details className="mt-1.5">
                    <summary className="text-[11px] text-slate-400 hover:text-slate-600 cursor-pointer select-none inline-block">
                      Payload details
                    </summary>
                    <pre className="mt-1 text-[11px] text-slate-600 bg-slate-50 border border-slate-100 rounded-lg p-2 overflow-auto max-h-40 whitespace-pre-wrap break-all">
                      {JSON.stringify(
                        {
                          ...(hasContent(action?.parameters) ? { parameters: action.parameters } : {}),
                          ...(hasContent(action?.body) ? { body: action.body } : {}),
                        },
                        null,
                        2
                      )}
                    </pre>
                  </details>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      <div className="px-4 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2">
        {meta ? (
          <span className={`inline-flex items-center gap-2 text-sm font-medium ${meta.className}`}>
            <meta.icon className={`w-4 h-4 ${status === 'running' ? 'animate-spin' : ''}`} />
            {meta.text}
          </span>
        ) : (
          <>
            <Button variant="ghost" size="sm" onClick={onCancel}>
              Cancel
            </Button>
            <Button
              variant={destructive ? 'danger' : 'primary'}
              size="sm"
              icon={Check}
              onClick={onConfirm}
            >
              {destructive ? 'Confirm & run' : 'Confirm'}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
