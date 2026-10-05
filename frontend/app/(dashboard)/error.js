'use client';

import React, { useEffect } from 'react';
import { AlertOctagon, RotateCcw, Home } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export default function DashboardError({ error, reset }) {
  useEffect(() => {
    console.error('FlowPilot dashboard error:', error);
  }, [error]);

  return (
    <div className="flex min-h-[70vh] items-center justify-center">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center shadow-2xs">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-rose-100 text-rose-600">
          <AlertOctagon className="w-7 h-7" />
        </div>

        <h2 className="text-lg font-bold text-slate-900">Something went wrong</h2>
        <p className="mt-1.5 text-sm text-slate-500">
          This module could not be rendered. Your saved data is still intact in local storage.
        </p>

        {error?.message && (
          <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 font-mono text-[11px] text-slate-600">
            {error.message}
          </p>
        )}

        <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
          <Button variant="primary" icon={RotateCcw} onClick={reset}>
            Try Again
          </Button>
          <Button variant="outline" icon={Home} onClick={() => window.location.assign('/dashboard')}>
            Back to Dashboard
          </Button>
        </div>
      </div>
    </div>
  );
}