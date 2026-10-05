'use client';

import React from 'react';

export function Badge({ children, variant = 'neutral', size = 'md', className = '' }) {
  const variants = {
    neutral: 'bg-slate-100 text-slate-700 border-slate-200',
    primary: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    warning: 'bg-amber-50 text-amber-700 border-amber-200',
    danger: 'bg-rose-50 text-rose-700 border-rose-200',
    info: 'bg-sky-50 text-sky-700 border-sky-200',
    purple: 'bg-purple-50 text-purple-700 border-purple-200',
  };

  const sizes = {
    sm: 'text-[11px] px-2 py-0.5 font-medium',
    md: 'text-xs px-2.5 py-0.5 font-medium',
    lg: 'text-sm px-3 py-1 font-medium',
  };

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border ${variants[variant] || variants.neutral} ${
        sizes[size] || sizes.md
      } ${className}`}
    >
      {children}
    </span>
  );
}

export function StatusBadge({ status }) {
  switch (status?.toLowerCase()) {
    case 'paid':
    case 'in_stock':
    case 'completed':
    case 'active':
    case 'success':
      return (
        <Badge variant="success">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-0.5" />
          {status === 'in_stock' ? 'In Stock' : status}
        </Badge>
      );

    case 'partial':
    case 'low_stock':
    case 'pending':
      return (
        <Badge variant="warning">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mr-0.5" />
          {status === 'low_stock' ? 'Low Stock' : status}
        </Badge>
      );

    case 'overdue':
    case 'out_of_stock':
    case 'cancelled':
    case 'inactive':
      return (
        <Badge variant="danger">
          <span className="w-1.5 h-1.5 rounded-full bg-rose-500 mr-0.5" />
          {status === 'out_of_stock' ? 'Out of Stock' : status}
        </Badge>
      );

    default:
      return <Badge variant="neutral">{status || '-'}</Badge>;
  }
}
