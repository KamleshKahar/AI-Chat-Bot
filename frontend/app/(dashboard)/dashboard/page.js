'use client';

import React from 'react';
import Link from 'next/link';
import {
  IndianRupee,
  ShoppingCart,
  Package,
  Users,
  ArrowRight,
  TrendingUp,
  AlertTriangle,
} from 'lucide-react';
import { useData } from '@/context/DataContext';
import { useServerResource } from '@/hooks/useServerQuery';
import { formatCurrency, formatNumber } from '@/lib/formatters';
import { OverviewCard } from '@/components/dashboard/OverviewCard';
import { QuickActions } from '@/components/dashboard/QuickActions';
import { SalesChart } from '@/components/dashboard/SalesChart';
import { LowStockAlert } from '@/components/dashboard/LowStockAlert';
import { RecentTransactions } from '@/components/dashboard/RecentTransactions';

/**
 * Dashboard.
 *
 * Every figure here is an aggregate, and aggregates are now the server's job.
 * The old version pulled all of `sales`, `invoices`, `products` and
 * `transactions` into the browser and reduced them in `useMemo` — which is not
 * just slow, it is wrong once the lists are paginated: "collection rate" would
 * have been computed over ten rows and presented as a company-wide percentage.
 */
export default function DashboardPage() {
  const { revision } = useData();

  const { data: summary, isLoading: loadingSummary } = useServerResource({
    path: '/dashboard/summary',
    refreshKey: revision,
  });

  const { data: alerts } = useServerResource({
    path: '/dashboard/alerts',
    query: { limit: 5 },
    refreshKey: revision,
  });

  const { data: recent } = useServerResource({
    path: '/dashboard/transactions',
    query: { limit: 6 },
    refreshKey: revision,
  });

  const metrics = summary?.metrics ?? null;
  const invoiceCounts = metrics?.invoiceCounts ?? {};

  /*
    Collection rate = collected / invoiced, both from the same aggregate. The
    status partition is exact: Paid + Partial + Pending + Overdue covers every
    live invoice, so the rate cannot exceed 100% or count an invoice twice.
  */
  const billed = Number(metrics?.totalSalesValue ?? 0);
  const collected = Number(metrics?.totalRevenue ?? 0);
  const collectionRate = billed > 0 ? Math.round((collected / billed) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Dashboard</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Welcome back — here is how your business is doing today.
          </p>
        </div>
        <QuickActions />
      </div>

      {/* Overview cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <OverviewCard
          title="Total Revenue"
          value={formatCurrency(metrics?.totalRevenue ?? 0)}
          hint="Collected from paid invoices"
          icon={IndianRupee}
          color="emerald"
          href="/reports"
          loading={loadingSummary}
        />
        <OverviewCard
          title="Total Sales"
          value={formatCurrency(metrics?.totalSalesValue ?? 0)}
          hint={`${formatNumber(metrics?.totalOrders ?? 0)} orders raised`}
          icon={ShoppingCart}
          color="indigo"
          href="/sales"
          loading={loadingSummary}
        />
        <OverviewCard
          title="Outstanding"
          value={formatCurrency(metrics?.totalOutstanding ?? 0)}
          hint={`${formatNumber((invoiceCounts.Pending ?? 0) + (invoiceCounts.Partial ?? 0) + (invoiceCounts.Overdue ?? 0))} unpaid invoices`}
          icon={TrendingUp}
          color="amber"
          href="/invoices"
          loading={loadingSummary}
        />
        <OverviewCard
          title="Products"
          value={formatNumber(metrics?.totalProducts ?? 0)}
          hint={`${formatNumber(metrics?.lowStockCount ?? 0)} low • ${formatNumber(
            metrics?.outOfStockCount ?? 0
          )} out of stock`}
          icon={Package}
          color="sky"
          href="/inventory"
          loading={loadingSummary}
        />
      </div>

      {/* Collection progress */}
      <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Collection Rate</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {formatCurrency(collected)} collected of {formatCurrency(billed)} invoiced
            </p>
          </div>
          <span className="text-2xl font-bold text-indigo-600">{collectionRate}%</span>
        </div>

        <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-emerald-500 transition-all"
            style={{ width: `${Math.min(100, collectionRate)}%` }}
          />
        </div>

        {/* Status breakdown, from the server's partition. */}
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Paid', count: invoiceCounts.Paid, tone: 'text-emerald-600' },
            { label: 'Partial', count: invoiceCounts.Partial, tone: 'text-amber-600' },
            { label: 'Pending', count: invoiceCounts.Pending, tone: 'text-slate-600' },
            { label: 'Overdue', count: invoiceCounts.Overdue, tone: 'text-rose-600' },
          ].map((bucket) => (
            <Link
              key={bucket.label}
              href={`/invoices?status=${bucket.label}`}
              className="rounded-lg border border-slate-200 px-3 py-2 transition hover:border-indigo-300 hover:bg-slate-50"
            >
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                {bucket.label}
              </p>
              <p className={`text-lg font-bold ${bucket.tone}`}>
                {formatNumber(bucket.count ?? 0)}
              </p>
            </Link>
          ))}
        </div>
      </div>

      {/* Charts & panels */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2">
          <SalesChart />
        </div>
        <div className="space-y-6">
          <LowStockAlert
            products={[...(alerts?.lowStock ?? []), ...(alerts?.outOfStock ?? [])]}
          />
        </div>
      </div>

      {/* `/dashboard/transactions` returns a bare array of ledger entries. */}
      <RecentTransactions transactions={recent ?? []} />

      {metrics && (
        <p className="text-center text-xs text-slate-400 pt-2">
          {formatNumber(metrics.totalCustomers ?? 0)} customers •{' '}
          {formatNumber(metrics.totalProducts ?? 0)} products •{' '}
          {formatNumber(metrics.totalOrders ?? 0)} orders
        </p>
      )}
    </div>
  );
}