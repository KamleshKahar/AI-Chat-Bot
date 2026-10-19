'use client';

import React from 'react';
import { Sparkles } from 'lucide-react';
import { PlanCard } from './PlanCard';
import { ActionResults } from './ActionResults';

function formatTime(timestamp) {
  if (!timestamp) return '';
  try {
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

/**
 * One chat turn.
 *
 * All model and API content is rendered as plain text (`whitespace-pre-wrap`
 * inside a React text node) — never `dangerouslySetInnerHTML`. The model's
 * output is untrusted input; React's escaping is the only sanitiser needed as
 * long as no component bypasses it.
 */
export function ChatMessage({ message, onConfirmPlan, onCancelPlan }) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] sm:max-w-[75%]">
          <div className="rounded-2xl rounded-br-md bg-indigo-600 text-white px-4 py-2.5 text-sm whitespace-pre-wrap break-words shadow-2xs">
            {message.content}
          </div>
          <div className="text-[10px] text-slate-400 mt-1 text-right">
            {formatTime(message.createdAt)}
          </div>
        </div>
      </div>
    );
  }

  const isError = message.kind === 'error';

  return (
    <div className="flex gap-3">
      <div className="w-7 h-7 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center shrink-0 mt-0.5">
        <Sparkles className="w-4 h-4" />
      </div>
      <div className="max-w-[85%] sm:max-w-[75%] min-w-0">
        {message.content && (
          <div
            className={`rounded-2xl rounded-tl-md px-4 py-2.5 text-sm whitespace-pre-wrap break-words shadow-2xs ${
              isError
                ? 'bg-rose-50 border border-rose-200 text-rose-800'
                : 'bg-white border border-slate-200 text-slate-700'
            }`}
          >
            {message.content}
          </div>
        )}

        {message.kind === 'plan' && message.plan && (
          <PlanCard
            plan={message.plan}
            status={message.planStatus || 'pending'}
            onConfirm={() => onConfirmPlan(message)}
            onCancel={() => onCancelPlan(message)}
          />
        )}

        {message.kind === 'result' && Array.isArray(message.results) && (
          <ActionResults results={message.results} totalActions={message.totalActions} />
        )}

        <div className="text-[10px] text-slate-400 mt-1">{formatTime(message.createdAt)}</div>
      </div>
    </div>
  );
}
