'use client';

import React from 'react';
import { MessageSquareText } from 'lucide-react';

/**
 * Starter prompts, shown only while the thread is empty.
 *
 * Deliberately mixes read queries with one write request so the confirmation
 * flow is discoverable from the first minute — the chips that start with
 * "Increase…" will always surface a plan card before anything runs.
 */
const SUGGESTIONS = [
  "How's business today?",
  'Which products are low on stock?',
  'Who owes us money?',
  "Show this month's sales summary",
  'Increase PRD-101 stock by 5 units',
];

export function SuggestionChips({ onPick, disabled = false }) {
  return (
    <div className="h-full flex flex-col items-center justify-center gap-4 text-center px-4">
      <div className="p-3 rounded-full bg-indigo-50 text-indigo-600 border border-indigo-100">
        <MessageSquareText className="w-6 h-6" />
      </div>
      <div>
        <h3 className="text-sm font-semibold text-slate-800">Ask FlowPilot anything</h3>
        <p className="text-sm text-slate-500 mt-1 max-w-md">
          Questions about products, customers, sales, invoices or reports are answered
          directly. Requests that change data always show a plan for your confirmation
          first — nothing is written until you approve it.
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {SUGGESTIONS.map((text) => (
          <button
            key={text}
            type="button"
            disabled={disabled}
            onClick={() => onPick(text)}
            className="text-xs px-3 py-1.5 rounded-full border border-slate-200 bg-white text-slate-600 hover:border-indigo-300 hover:text-indigo-700 hover:bg-indigo-50 transition-colors disabled:opacity-50"
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}
