'use client';

import React from 'react';
import { PackageOpen } from 'lucide-react';
import { Button } from './Button';

export function EmptyState({
  icon: Icon = PackageOpen,
  title = 'No records found',
  description = 'There are no items matching your criteria right now.',
  actionLabel,
  onAction,
  className = '',
}) {
  return (
    <div className={`flex flex-col items-center justify-center p-12 text-center rounded-xl bg-white border border-dashed border-slate-300 ${className}`}>
      <div className="p-3 bg-slate-50 text-slate-400 rounded-full mb-3 border border-slate-100">
        <Icon className="w-8 h-8" />
      </div>
      <h3 className="text-base font-semibold text-slate-800 mb-1">{title}</h3>
      <p className="text-sm text-slate-500 max-w-sm mb-5">{description}</p>
      {actionLabel && onAction && (
        <Button variant="primary" size="sm" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
}

export function LoadingSpinner({ text = 'Loading...' }) {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-center">
      <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin mb-3"></div>
      <p className="text-sm font-medium text-slate-500">{text}</p>
    </div>
  );
}
