'use client';

import React from 'react';
import { Search, X } from 'lucide-react';

export function SearchInput({ value, onChange, placeholder = 'Search...' }) {
  return (
    <div className="relative w-full sm:w-72">
      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
        <Search className="h-4 w-4" />
      </div>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-8 text-sm text-slate-900 placeholder-slate-400 transition-colors hover:border-slate-400 focus:outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-500/20"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
          aria-label="Clear search"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

export function FilterBar({ children, className = '' }) {
  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>{children}</div>
  );
}

export function FilterChip({ active, onClick, children, count }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
        active
          ? 'border-indigo-600 bg-indigo-600 text-white shadow-2xs'
          : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900'
      }`}
    >
      {children}
      {typeof count === 'number' && (
        <span
          className={`rounded px-1 text-[10px] font-bold ${
            active ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
          }`}
        >
          {count}
        </span>
      )}
    </button>
  );
}