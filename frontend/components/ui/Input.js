'use client';

import React, { forwardRef } from 'react';

export const Input = forwardRef(function Input(
  {
    label,
    error,
    helperText,
    icon: Icon,
    iconRight: IconRight,
    className = '',
    required = false,
    id,
    ...props
  },
  ref
) {
  const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

  return (
    <div className="w-full">
      {label && (
        <label
          htmlFor={inputId}
          className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5"
        >
          {label} {required && <span className="text-rose-500">*</span>}
        </label>
      )}

      <div className="relative rounded-lg shadow-2xs">
        {Icon && (
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
            <Icon className="h-4 w-4" />
          </div>
        )}

        <input
          id={inputId}
          ref={ref}
          required={required}
          className={`w-full rounded-lg border text-sm text-slate-900 bg-white placeholder-slate-400 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 disabled:bg-slate-50 disabled:text-slate-500 ${
            Icon ? 'pl-9' : 'pl-3'
          } ${IconRight ? 'pr-9' : 'pr-3'} py-2 ${
            error
              ? 'border-rose-400 text-rose-900 focus:border-rose-500 focus:ring-rose-500/20'
              : 'border-slate-300 hover:border-slate-400'
          } ${className}`}
          {...props}
        />

        {IconRight && (
          <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-slate-400">
            <IconRight className="h-4 w-4" />
          </div>
        )}
      </div>

      {error ? (
        <p className="mt-1 text-xs text-rose-600">{error}</p>
      ) : helperText ? (
        <p className="mt-1 text-xs text-slate-500">{helperText}</p>
      ) : null}
    </div>
  );
});
