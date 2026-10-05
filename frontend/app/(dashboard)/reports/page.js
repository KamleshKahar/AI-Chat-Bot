'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  BarChart3,
  IndianRupee,
  ShoppingCart,
  Package,
  Users,
  TrendingUp,
  CalendarRange,
  Layers,
  Percent,
  Clock,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useData } from '@/context/DataContext';
import { useServerList, useServerResource, useDebouncedValue } from '@/hooks/useServerQuery';
import { formatCurrency, formatNumber, formatDate } from '@/lib/formatters';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, StatCard } from '@/components/ui/Card';
import { FilterChip } from '@/components/ui/SearchInput';
import { LineChart, BarChart, DonutChart, ProgressBar } from '@/components/reports/Charts';
import { StatusBadge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/StateFeedback';

const PER_PAGE = 10;

/** Sent as `?from` for the "All time" preset; the API treats it as unbounded. */
const EPOCH = '2000-01-01';

function isoDay(date) {
  return date.toISOString().slice(0, 10);
}

function daysAgo(n) {
  return isoDay(new Date(Date.now() - n * 86_400_000));
}

/**
 * Reports & analytics.
 *
 * Every number on this screen is a SQL aggregate now. The previous version
 * pulled the entire `sales`, `customers` and `products` collections into the
 * browser and reduced them with `lib/salesLogic.js` helpers — which was both
 * slow and quietly wrong once those lists became paginated: the "gross profit"
 * would have subtracted COGS computed from whichever ten products happened to be
 * in memory.
 *
 * So `lib/salesLogic.js`'s aggregation helpers now have no callers in the app.
 * They are left in place because `scripts/verify.mjs` still pins the billing
 * maths against them, which is the contract `backend/src/lib/billing.js` mirrors.
 */
export default function ReportsPage() {
  const { revision } = useData();

  const [toDate, setToDate] = useState(() => daysAgo(0));
  const [fromDate, setFromDate] = useState(() => daysAgo(30));
  const [period, setPeriod] = useState('day');
  const [activeTab, setActiveTab] = useState('sales');
  const [registerPage, setRegisterPage] = useState(1);

  // Date changes re-issue every aggregation; a short debounce keeps the preset
  // buttons from firing six requests as they settle.
  const debouncedRange = useDebouncedValue({ from: fromDate, to: toDate }, 250);

  const summary = useServerResource({
    path: '/reports/sales-summary',
    query: debouncedRange,
    refreshKey: revision,
  });
  const trend = useServerResource({
    path: '/reports/revenue-trend',
    query: { ...debouncedRange, granularity: period },
    refreshKey: revision,
  });
  const payments = useServerResource({
    path: '/reports/payment-breakdown',
    query: debouncedRange,
    refreshKey: revision,
  });
  const products = useServerResource({
    path: '/reports/product-performance',
    query: debouncedRange,
    refreshKey: revision,
  });
  const valuation = useServerResource({ path: '/reports/inventory-valuation', refreshKey: revision });
  const customers = useServerResource({
    path: '/reports/customer-performance',
    query: debouncedRange,
    refreshKey: revision,
  });
  const aging = useServerResource({ path: '/reports/receivables-aging', refreshKey: revision });

  /*
    The sales register is a real paginated list, not an aggregate — the report
    endpoints deliberately do not return thousands of individual rows. Page 1 is
    reset whenever the range changes so the user is never left on an out-of-range
    page showing an empty table.
  */
  const register = useServerList({
    path: '/sales',
    query: { ...debouncedRange, page: registerPage, limit: PER_PAGE, sort: 'date', order: 'desc' },
    refreshKey: revision,
  });

  const setRange = (from, to) => {
    setFromDate(from);
    setToDate(to);
    setRegisterPage(1);
  };

  const current = summary.data?.current ?? null;
  const previous = summary.data?.previous ?? null;

  const productRows = products.data?.products ?? [];
  const customerRows = customers.data?.customers ?? [];
  const categoryRows = valuation.data?.byCategory ?? [];
  const valTotals = valuation.data?.totals ?? null;

  const trendData = trend.data ?? [];
  const topProducts = productRows.filter((p) => p.unitsSold > 0).slice(0, 8);
  const maxRevenue = Math.max(...topProducts.map((p) => Number(p.revenue) || 0), 1);

  /**
   * Period-over-period change, as a signed percentage.
   * Returns null when there is no comparable prior window (or it was empty), so
   * the card can say "no prior data" rather than claiming +100%.
   */
  const delta = (now, before) => {
    const a = Number(now ?? 0);
    const b = Number(before ?? 0);
    if (b === 0) return null;
    return Math.round(((a - b) / b) * 100);
  };

  const salesDelta = delta(current?.salesValue, previous?.salesValue);
  const collectedDelta = delta(current?.collected, previous?.collected);

  const presets = [
    { label: 'Last 7 days', days: 7 },
    { label: 'Last 30 days', days: 30 },
    { label: 'Last 90 days', days: 90 },
    { label: 'All time', days: null },
  ];

  const applyPreset = (days) => {
    if (days === null) setRange(EPOCH, daysAgo(0));
    else setRange(daysAgo(days), daysAgo(0));
  };

  const tabs = [
    { key: 'sales', label: 'Sales & Revenue', icon: IndianRupee },
    { key: 'products', label: 'Product Performance', icon: Package },
    { key: 'inventory', label: 'Inventory', icon: Layers },
    { key: 'customers', label: 'Customers', icon: Users },
  ];

  const AGING_LABELS = {
    current: 'Not yet due',
    '1-30': '1–30 days late',
    '31-60': '31–60 days late',
    '60+': '60+ days late',
  };
  const agingBuckets = (aging.data?.buckets ?? []).filter((b) => b.bucket !== 'settled');

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports & Analytics"
        description="Revenue insights, product performance, inventory valuation and customer analytics."
        breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Reports' }]}
        actions={
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5">
              <CalendarRange className="w-4 h-4 text-slate-400" />
              <input
                type="date"
                value={fromDate}
                max={toDate}
                onChange={(e) => setRange(e.target.value, toDate)}
                className="text-xs font-medium text-slate-700 focus:outline-none bg-transparent"
              />
              <span className="text-slate-300 text-xs">–</span>
              <input
                type="date"
                value={toDate}
                min={fromDate}
                max={daysAgo(0)}
                onChange={(e) => setRange(fromDate, e.target.value)}
                className="text-xs font-medium text-slate-700 focus:outline-none bg-transparent"
              />
            </div>
          </div>
        }
      />

      {/* Date presets + period */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {presets.map((p) => (
            <FilterChip
              key={p.label}
              active={fromDate === (p.days === null ? EPOCH : daysAgo(p.days))}
              onClick={() => applyPreset(p.days)}
            >
              {p.label}
            </FilterChip>
          ))}
          <span className="text-xs text-slate-400 ml-1">
            {formatDate(fromDate)} → {formatDate(toDate)}
          </span>
        </div>

        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg self-start">
          {['day', 'week', 'month'].map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              className={`px-3 py-1 text-xs font-semibold rounded-md capitalize transition ${
                period === p ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          label="Gross Revenue"
          value={formatCurrency(current?.salesValue ?? 0)}
          hint={
            salesDelta === null
              ? `${formatNumber(current?.orders ?? 0)} orders • no prior period to compare`
              : `${formatNumber(current?.orders ?? 0)} orders • ${salesDelta >= 0 ? '+' : ''}${salesDelta}% vs previous period`
          }
          icon={IndianRupee}
          tone="indigo"
        />
        <StatCard
          label="Amount Collected"
          value={formatCurrency(current?.collected ?? 0)}
          hint={
            collectedDelta === null
              ? `Avg order ${formatCurrency(current?.avgOrderValue ?? 0)}`
              : `${collectedDelta >= 0 ? '+' : ''}${collectedDelta}% vs previous period • avg ${formatCurrency(
                  current?.avgOrderValue ?? 0
                )}`
          }
          icon={TrendingUp}
          tone="emerald"
        />
        <StatCard
          label="Gross Profit"
          value={formatCurrency(products.data?.totals?.profit ?? 0)}
          hint={`Margin ${
            Number(products.data?.totals?.revenue ?? 0) > 0
              ? Math.round(
                  (Number(products.data.totals.profit) / Number(products.data.totals.revenue)) * 100
                )
              : 0
          }% after COGS`}
          icon={Percent}
          tone="sky"
        />
        <StatCard
          label="Units Sold"
          value={formatNumber(products.data?.totals?.unitsSold ?? 0)}
          hint={`Tax collected ${formatCurrency(current?.taxCollected ?? 0)} • discount ${formatCurrency(
            current?.discountGiven ?? 0
          )}`}
          icon={ShoppingCart}
          tone="amber"
        />
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2.5 text-sm font-semibold border-b-2 -mb-px transition ${
              activeTab === tab.key
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* SALES TAB */}
      {activeTab === 'sales' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <Card
              title="Revenue Trend"
              description={`Billed per ${period} in the selected window`}
              className="xl:col-span-2"
            >
              <LineChart
                data={trendData.map((d) => ({ label: d.label, value: d.revenue }))}
                xKey="label"
                yKey="value"
              />
            </Card>

            <Card title="Payment Methods" description="Collection channel split">
              <DonutChart data={(payments.data ?? []).map((p) => ({ label: p.method, value: p.amount }))} />
            </Card>
          </div>

          <Card title="Revenue Collected" description={`Collection confirmed per ${period}`}>
            <BarChart
              data={trendData.map((d) => ({ label: d.label, value: d.collected }))}
              color="#10b981"
            />
          </Card>

          {/* Sales register — paginated server-side. */}
          <Card
            title="Sales Register"
            description="Every transaction in the selected period"
            padded={false}
            actions={
              register.meta.totalPages > 1 && (
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <button
                    onClick={() => setRegisterPage((p) => Math.max(1, p - 1))}
                    disabled={registerPage <= 1}
                    className="rounded-md border border-slate-300 p-1 disabled:opacity-40 hover:bg-slate-50"
                    aria-label="Previous page"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <span className="font-medium">
                    Page {registerPage} of {register.meta.totalPages}
                  </span>
                  <button
                    onClick={() => setRegisterPage((p) => p + 1)}
                    disabled={registerPage >= register.meta.totalPages}
                    className="rounded-md border border-slate-300 p-1 disabled:opacity-40 hover:bg-slate-50"
                    aria-label="Next page"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )
            }
          >
            {register.rows.length === 0 ? (
              <EmptyState
                icon={BarChart3}
                title="No sales in this period"
                description="Adjust the date range or record a new sale to populate this report."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs min-w-[720px]">
                  <thead className="bg-slate-50 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Invoice</th>
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">Customer</th>
                      <th className="px-4 py-3 text-right">Billed</th>
                      <th className="px-4 py-3 text-right">Discount</th>
                      <th className="px-4 py-3 text-right">Tax</th>
                      <th className="px-4 py-3 text-right">Collected</th>
                      <th className="px-4 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {register.rows.map((sale) => (
                      <tr key={sale.id} className="hover:bg-slate-50/60">
                        <td className="px-4 py-3">
                          <Link
                            href={`/invoices/${sale.invoiceNumber}`}
                            className="font-mono font-semibold text-indigo-600 hover:text-indigo-700"
                          >
                            {sale.invoiceNumber}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-slate-600">{formatDate(sale.date)}</td>
                        <td className="px-4 py-3">
                          <p className="font-semibold text-slate-800">{sale.customerName}</p>
                          <p className="text-[11px] text-slate-400">{sale.customerCompany}</p>
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-slate-900">
                          {formatCurrency(sale.grandTotal)}
                        </td>
                        <td className="px-4 py-3 text-right text-emerald-600">
                          {Number(sale.discountAmount) > 0
                            ? `− ${formatCurrency(sale.discountAmount)}`
                            : '—'}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-600">
                          {formatCurrency(sale.taxAmount)}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-emerald-600">
                          {formatCurrency(sale.paidAmount)}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={sale.paymentStatus} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* PRODUCTS TAB */}
      {activeTab === 'products' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <Card title="Top Products by Revenue" description="Units sold within the selected period">
              {topProducts.length === 0 ? (
                <EmptyState
                  icon={Package}
                  title="No product sales"
                  description="No products were sold in the selected date range."
                />
              ) : (
                <div className="space-y-3.5">
                  {topProducts.map((p, index) => (
                    <div key={p.id}>
                      <div className="flex items-center justify-between gap-3 text-xs mb-1.5">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="w-5 h-5 rounded bg-slate-100 text-slate-500 text-[10px] font-bold flex items-center justify-center shrink-0">
                            {index + 1}
                          </span>
                          <span className="font-semibold text-slate-800 truncate">{p.name}</span>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="text-slate-500">{formatNumber(p.unitsSold)} units</span>
                          <span className="font-bold text-slate-900 w-24 text-right">
                            {formatCurrency(p.revenue)}
                          </span>
                        </div>
                      </div>
                      <ProgressBar value={p.revenue} max={maxRevenue} tone="indigo" showLabel={false} />
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card title="Category Revenue Mix" description="Where the revenue is coming from">
              <DonutChart
                data={productRows
                  .filter((p) => Number(p.revenue) > 0)
                  .reduce((acc, p) => {
                    const existing = acc.find((a) => a.label === p.category);
                    if (existing) existing.value += Number(p.revenue);
                    else acc.push({ label: p.category, value: Number(p.revenue) });
                    return acc;
                  }, [])}
              />
            </Card>
          </div>

          <Card
            title="Product Performance Detail"
            description="Revenue, profit and margin for every catalogue item"
            padded={false}
          >
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs min-w-[760px]">
                <thead className="bg-slate-50 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Product</th>
                    <th className="px-4 py-3">Category</th>
                    <th className="px-4 py-3 text-right">Units Sold</th>
                    <th className="px-4 py-3 text-right">Revenue</th>
                    <th className="px-4 py-3 text-right">Profit</th>
                    <th className="px-4 py-3 text-right">Margin</th>
                    <th className="px-4 py-3 text-right">Stock Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {productRows.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50/60">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-800">{p.name}</p>
                        <p className="text-[11px] text-slate-400 font-mono">{p.sku}</p>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{p.category}</td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-800">
                        {formatNumber(p.unitsSold)}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-slate-900">
                        {formatCurrency(p.revenue)}
                      </td>
                      <td
                        className={`px-4 py-3 text-right font-semibold ${
                          p.profit >= 0 ? 'text-emerald-600' : 'text-rose-600'
                        }`}
                      >
                        {formatCurrency(p.profit)}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-600">{p.marginPercent}%</td>
                      <td className="px-4 py-3 text-right text-slate-600">
                        {formatCurrency(p.stockValue)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* INVENTORY TAB */}
      {activeTab === 'inventory' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <Card title="Stock Valuation by Category" description="Value of inventory at cost price">
              <DonutChart
                data={categoryRows.map((c) => ({ label: c.category, value: c.costValue }))}
              />
            </Card>

            <Card title="Retail Value by Category" description="Potential revenue if all stock is sold">
              <BarChart
                data={categoryRows.map((c) => ({
                  label: c.category.split(' ')[0],
                  value: c.retailValue,
                }))}
                color="#0ea5e9"
              />
            </Card>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard
              label="Total Inventory (Cost)"
              value={formatCurrency(valTotals?.costValue ?? 0)}
              hint={`${formatNumber(valTotals?.products ?? 0)} SKUs`}
              icon={Package}
              tone="indigo"
            />
            <StatCard
              label="Potential Retail Revenue"
              value={formatCurrency(valTotals?.retailValue ?? 0)}
              hint={`Profit ${formatCurrency(valTotals?.potentialProfit ?? 0)}`}
              icon={IndianRupee}
              tone="emerald"
            />
            <StatCard
              label="Units in Warehouse"
              value={formatNumber(valTotals?.units ?? 0)}
              hint={`${formatNumber(valTotals?.statusCounts?.out_of_stock ?? 0)} SKUs out of stock`}
              icon={Layers}
              tone="sky"
            />
          </div>

          <Card title="Category Breakdown" description="Stock position per category" padded={false}>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs min-w-[640px]">
                <thead className="bg-slate-50 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Category</th>
                    <th className="px-4 py-3 text-right">SKUs</th>
                    <th className="px-4 py-3 text-right">Units</th>
                    <th className="px-4 py-3 text-right">Cost Value</th>
                    <th className="px-4 py-3 text-right">Retail Value</th>
                    <th className="px-4 py-3 text-right">Potential Profit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {categoryRows.map((cat) => (
                    <tr key={cat.category} className="hover:bg-slate-50/60">
                      <td className="px-4 py-3 font-semibold text-slate-800">{cat.category}</td>
                      <td className="px-4 py-3 text-right text-slate-600">{cat.products}</td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-800">
                        {formatNumber(cat.units)}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-slate-900">
                        {formatCurrency(cat.costValue)}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-600">
                        {formatCurrency(cat.retailValue)}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-emerald-600">
                        {formatCurrency(Number(cat.retailValue) - Number(cat.costValue))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* CUSTOMERS TAB */}
      {activeTab === 'customers' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <Card title="Top Customers by Value" description="Lifetime value in the selected period">
              {customerRows.filter((c) => Number(c.lifetimeValue) > 0).length === 0 ? (
                <EmptyState
                  icon={Users}
                  title="No customer activity"
                  description="No customer purchases recorded in the selected period."
                />
              ) : (
                <BarChart
                  data={customerRows
                    .slice(0, 8)
                    .map((c) => ({ label: c.name.split(' ')[0], value: c.lifetimeValue }))}
                  color="#8b5cf6"
                />
              )}
            </Card>

            <Card title="Outstanding Receivables" description="Current balance pending per customer">
              <DonutChart
                data={customerRows
                  .filter((c) => Number(c.outstanding) > 0)
                  .map((c) => ({ label: c.name, value: c.outstanding }))}
              />
            </Card>
          </div>

          {/* Aging is an all-time view: what is owed, and how late. */}
          <Card
            title="Receivables Aging"
            description="All unpaid invoices bucketed by how far past due they are"
            padded={false}
          >
            {agingBuckets.length === 0 ? (
              <EmptyState
                icon={Clock}
                title="Nothing outstanding"
                description="Every invoice raised so far has been settled in full."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs min-w-[480px]">
                  <thead className="bg-slate-50 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Age bucket</th>
                      <th className="px-4 py-3 text-right">Invoices</th>
                      <th className="px-4 py-3 text-right">Outstanding</th>
                      <th className="px-4 py-3 text-right">Share</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {agingBuckets.map((bucket) => (
                      <tr key={bucket.bucket} className="hover:bg-slate-50/60">
                        <td className="px-4 py-3 font-semibold text-slate-800">
                          {AGING_LABELS[bucket.bucket] ?? bucket.bucket}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-600">{bucket.invoices}</td>
                        <td className="px-4 py-3 text-right font-bold text-slate-900">
                          {formatCurrency(bucket.amount)}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-600">
                          {Number(aging.data?.outstanding ?? 0) > 0
                            ? `${Math.round((Number(bucket.amount) / Number(aging.data.outstanding)) * 100)}%`
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-50 font-semibold">
                    <tr>
                      <td className="px-4 py-3 text-slate-800">Total outstanding</td>
                      <td />
                      <td className="px-4 py-3 text-right font-bold text-slate-900">
                        {formatCurrency(aging.data?.outstanding ?? 0)}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </Card>

          <Card title="Customer Performance Detail" padded={false}>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs min-w-[760px]">
                <thead className="bg-slate-50 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Customer</th>
                    <th className="px-4 py-3">Location</th>
                    <th className="px-4 py-3 text-right">Orders</th>
                    <th className="px-4 py-3 text-right">Lifetime Value</th>
                    <th className="px-4 py-3 text-right">Avg Order</th>
                    <th className="px-4 py-3 text-right">Collected</th>
                    <th className="px-4 py-3 text-right">Outstanding</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {customerRows.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-50/60">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-800">{c.name}</p>
                        <p className="text-[11px] text-slate-400">{c.company}</p>
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {c.city}
                        {c.state ? `, ${c.state}` : ''}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-800">{c.orders}</td>
                      <td className="px-4 py-3 text-right font-bold text-slate-900">
                        {formatCurrency(c.lifetimeValue)}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-600">
                        {formatCurrency(c.avgOrderValue)}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-emerald-600">
                        {formatCurrency(c.collected)}
                      </td>
                      <td
                        className={`px-4 py-3 text-right font-semibold ${
                          c.outstanding > 0 ? 'text-amber-600' : 'text-slate-400'
                        }`}
                      >
                        {c.outstanding > 0 ? formatCurrency(c.outstanding) : 'Settled'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}