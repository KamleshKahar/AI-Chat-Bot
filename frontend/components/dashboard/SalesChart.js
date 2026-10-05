'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { apiGet } from '@/lib/apiClient';
import { formatCurrency, formatNumber } from '@/lib/formatters';

const MONTHS = 6;

/** First day of the month `offset` months before now, as YYYY-MM-DD. */
function monthStart(offset) {
  const now = new Date();
  const cursor = new Date(now.getFullYear(), now.getMonth() - offset, 1);
  return `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-01`;
}

/** Last day of the current month, as YYYY-MM-DD. */
function currentMonthEnd() {
  const now = new Date();
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const month = String(last.getMonth() + 1).padStart(2, '0');
  return `${last.getFullYear()}-${month}-${String(last.getDate()).padStart(2, '0')}`;
}

/**
 * Six-month sales trend.
 *
 * This used to bucket an in-memory `sales` array by month in the browser. That is
 * only correct if you hold every sale — which the paginated API does not — so the
 * figures would silently describe one page of orders. It now reads
 * `GET /api/reports/revenue-trend?granularity=month`, which groups in SQL over
 * the whole `invoices` table and returns `{ date, label, revenue, collected,
 * orders }` per bucket.
 */
export function SalesChart() {
  const [metric, setMetric] = useState('revenue');
  const [series, setSeries] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // The window depends on how many months back we show and is fixed for the life
  // of the component, so it is computed once rather than per render.
  const range = useMemo(
    () => ({ from: monthStart(MONTHS - 1), to: currentMonthEnd() }),
    []
  );

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    setIsLoading(true);

    apiGet('/reports/revenue-trend', {
      query: { ...range, granularity: 'month' },
      signal: controller.signal,
    })
      .then(({ data }) => {
        if (cancelled) return;
        const rows = Array.isArray(data) ? data : [];
        // A `month` series only contains months that had sales. Padding at the
        // front keeps the axis a fixed six columns wide.
        const padded = rows.slice();
        while (padded.length > 0 && padded.length < MONTHS) {
          padded.unshift({ ...padded[0], date: null, label: '', revenue: 0, collected: 0, orders: 0 });
        }
        setSeries(padded.slice(-MONTHS));
      })
      .catch((err) => {
        if (cancelled || err?.name === 'AbortError') return;
        setSeries([]);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [range]);

  const data = series;

  const maxValue = Math.max(...data.map((d) => Number(d[metric]) || 0), 1);

  const totalOrders = data.reduce((acc, d) => acc + Number(d.orders || 0), 0);

  // Tallest bar, used to highlight the peak. Written with an explicit block body
  // so the `reduce` call cannot be misread as a comma expression.
  const best = data.reduce((acc, d) => {
    return Number(d[metric] || 0) > Number((acc && acc[metric]) || 0) ? d : acc;
  }, data[0]);

  return (
    <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-2xs">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-6">
        <div>
          <h3 className="text-base font-semibold text-slate-900">Sales Overview</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Last {MONTHS} months • {formatNumber(totalOrders)} orders booked
          </p>
        </div>

        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg self-start">
          {[
            { key: 'revenue', label: 'Billed' },
            { key: 'collected', label: 'Collected' },
            { key: 'orders', label: 'Orders' },
          ].map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => setMetric(opt.key)}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition ${
                metric === opt.key
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className={`flex items-end gap-3 sm:gap-6 h-56 pt-8 px-1 ${isLoading ? 'opacity-50' : ''}`}>
        {data.length === 0 ? (
          <p className="w-full text-center text-sm text-slate-400 py-16">
            {isLoading ? 'Loading sales history...' : 'No sales in this period.'}
          </p>
        ) : (
          data.map((item, idx) => {
            const value = Number(item[metric]) || 0;
            const heightPercent = Math.round((value / maxValue) * 100);
            const isPeak = Boolean(best && item.date && item.date === best.date);
            const label = item.label || '—';

            return (
              <div
                key={item.date ?? `empty-${idx}`}
                className="flex-1 flex flex-col items-center justify-end h-full group relative"
              >
                <div className="absolute -top-1 left-1/2 -translate-x-1/2 mb-1 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-900 text-white text-[10px] font-medium py-1.5 px-2.5 rounded-lg pointer-events-none whitespace-nowrap z-10 shadow-lg">
                  {metric === 'orders' ? `${item.orders} orders` : formatCurrency(value)}
                  <span className="block text-slate-300 font-normal">
                    {label} • billed {formatCurrency(item.revenue)}
                  </span>
                </div>

                <div className="w-full h-full flex items-end max-w-[52px]">
                  <div
                    style={{ height: `${Math.max(heightPercent, 3)}%` }}
                    className={`w-full rounded-t-md transition-all ${
                      isPeak ? 'bg-indigo-600' : 'bg-indigo-200 group-hover:bg-indigo-400'
                    }`}
                  />
                </div>

                <span
                  className={`text-xs mt-2 font-medium ${
                    isPeak ? 'text-indigo-600 font-semibold' : 'text-slate-500'
                  }`}
                >
                  {label}
                </span>
              </div>
            );
          })
        )}
      </div>

      <div className="flex items-center justify-between text-xs text-slate-500 mt-4 pt-4 border-t border-slate-100">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 bg-indigo-600 rounded-sm" />
          <span>{metric === 'orders' ? 'Orders per month' : 'Amount in ₹'}</span>
        </div>
        {best?.date && (
          <span className="font-semibold text-slate-800">
            Best month {best.label}:{' '}
            {metric === 'orders'
              ? `${best.orders} orders`
              : formatCurrency(Number(best[metric]) || 0)}
          </span>
        )}
      </div>
    </div>
  );
}