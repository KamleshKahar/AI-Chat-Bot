'use client';

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ShoppingCart,
  Plus,
  IndianRupee,
  Receipt,
  TrendingUp,
  Eye,
  FileText,
  X,
} from 'lucide-react';
import { useData } from '@/context/DataContext';
import { useToast } from '@/context/ToastContext';
import { useServerList, useServerResource, useDebouncedValue } from '@/hooks/useServerQuery';
import { formatCurrency, formatDate, formatNumber } from '@/lib/formatters';
import { Button } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, StatCard } from '@/components/ui/Card';
import { DataTable } from '@/components/ui/DataTable';
import { SearchInput, FilterChip } from '@/components/ui/SearchInput';
import { EmptyState } from '@/components/ui/StateFeedback';
import { StatusBadge } from '@/components/ui/Badge';
import { CreateSaleForm } from '@/components/sales/CreateSaleForm';
import { SaleDetailModal } from '@/components/sales/SaleDetailModal';

const PER_PAGE = 10;

const PAYMENT_STATUSES = ['all', 'Paid', 'Partial', 'Pending', 'Overdue'];

/** Max rows the picker dropdowns will fetch — matches the API's `MAX_LIMIT`. */
const PICKER_LIMIT = 100;

export default function SalesPage() {
  const { createSale, revision } = useData();
  const { success, error: errorToast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();

  // --- Server query state --------------------------------------------------
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [methodFilter, setMethodFilter] = useState('all');
  const [sortBy, setSortBy] = useState('date');
  const [page, setPage] = useState(1);

  const debouncedSearch = useDebouncedValue(search, 300);

  const query = useMemo(
    () => ({
      search: debouncedSearch.trim() || undefined,
      paymentStatus: statusFilter === 'all' ? undefined : statusFilter,
      paymentMethod: methodFilter === 'all' ? undefined : methodFilter,
      sort: sortBy,
      order: 'desc',
      page,
      limit: PER_PAGE,
    }),
    [debouncedSearch, statusFilter, methodFilter, sortBy, page]
  );

  const { rows: sales, meta, counts, isLoading } = useServerList({
    path: '/sales',
    query,
    refreshKey: revision,
  });

  const { data: summary } = useServerResource({ path: '/dashboard/summary', refreshKey: revision });
  const metrics = summary?.metrics ?? null;

  // Customer list for the sale form. Fetched independently of the table query
  // because the form needs a complete set to choose from, not one page of it.
  const { rows: customers } = useServerList({
    path: '/customers',
    query: { status: 'active', limit: PICKER_LIMIT, sort: 'name', order: 'asc' },
    refreshKey: revision,
  });

  const [creating, setCreating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [viewingId, setViewingId] = useState(null);

  // Deep-link: /sales?action=new
  const handledQuery = useRef(null);
  const rawQuery = searchParams.toString();

  useEffect(() => {
    if (handledQuery.current === rawQuery) return;
    handledQuery.current = rawQuery;

    if (searchParams.get('action') === 'new') setCreating(true);
  }, [rawQuery, searchParams]);

  // A new filter or search always invalidates the current page number.
  //
  // Two shapes, deliberately. `resetPageAndSet` is a plain `onChange` handler —
  // Select passes the new value in. `pickFilter` *builds* an onClick handler.
  // Writing `onClick={resetPageAndSet(setStatusFilter)(status)}` instead would
  // call the returned function during render, making its `setPage(1)` a
  // render-phase update: React throws "Too many re-renders" and the page never
  // paints.
  const resetPageAndSet = (setter) => (value) => {
    setPage(1);
    setter(value);
  };

  const pickFilter = (setter) => (value) => () => {
    setPage(1);
    setter(value);
  };

  const clearFilters = () => {
    setSearch('');
    setStatusFilter('all');
    setMethodFilter('all');
    setPage(1);
  };

  const { data: saleDetail } = useServerResource({
    path: viewingId ? `/sales/${encodeURIComponent(viewingId)}` : null,
    enabled: Boolean(viewingId),
    refreshKey: revision,
  });

  /**
   * Create the sale.
   *
   * `createSale` is now async — it POSTs once and the server performs the whole
   * write (document codes, stock movement, customer totals, frozen snapshot,
   * ledger) in a single transaction. The previous code read
   * `result.sale.invoiceNumber` synchronously; without the `await` that would
   * have thrown on a Promise.
   */
  const handleCreateSale = async (payload) => {
    setIsSubmitting(true);
    try {
      const result = await createSale(payload);
      const invoice = result?.invoice;
      success(
        `Sale ${result?.sale?.invoiceNumber ?? ''} created · Invoice generated for ${formatCurrency(
          result?.invoice?.grandTotal ?? 0
        )}`
      );
      setCreating(false);
      if (invoice?.id) router.push(`/invoices/${invoice.id}`);
      else router.push('/invoices');
    } catch (err) {
      errorToast(err.message || 'Failed to create sale');
    } finally {
      setIsSubmitting(false);
    }
  };

  const columns = [
    {
      key: 'invoiceNumber',
      header: 'Invoice / Sale',
      accessor: 'invoiceNumber',
      render: (row) => (
        <div className="min-w-0">
          <p className="font-mono font-semibold text-slate-900 text-xs">{row.invoiceNumber}</p>
          <p className="text-[11px] text-slate-500">
            {row.id} • {formatDate(row.date)}
          </p>
        </div>
      ),
    },
    {
      key: 'customer',
      header: 'Customer',
      render: (row) => (
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center font-bold text-[11px] shrink-0">
            {(row.customerName || '?')
              .split(' ')
              .map((n) => n[0])
              .slice(0, 2)
              .join('')}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-slate-900 truncate">{row.customerName}</p>
            <p className="text-xs text-slate-500 truncate">{row.customerCompany || 'Walk-in'}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'items',
      header: 'Items',
      render: (row) => (
        <span className="text-sm text-slate-600">
          {(row.items?.length ?? 0)} item{(row.items?.length ?? 0) > 1 ? 's' : ''} •{' '}
          {(row.items ?? []).reduce((acc, i) => acc + Number(i.quantity), 0)} units
        </span>
      ),
    },
    {
      key: 'grandTotal',
      header: 'Total',
      accessor: 'grandTotal',
      render: (row) => (
        <span className="font-bold text-slate-900 whitespace-nowrap">
          {formatCurrency(row.grandTotal)}
        </span>
      ),
    },
    {
      key: 'balance',
      header: 'Balance',
      render: (row) => {
        const due = Number(row.grandTotal) - Number(row.paidAmount);
        return due > 0 ? (
          <span className="font-semibold text-amber-600 whitespace-nowrap">
            {formatCurrency(due)}
          </span>
        ) : (
          <span className="text-xs text-slate-400">Settled</span>
        );
      },
    },
    {
      key: 'paymentStatus',
      header: 'Payment',
      accessor: 'paymentStatus',
      render: (row) => <StatusBadge status={row.paymentStatus} />,
    },
    {
      key: 'actions',
      header: '',
      headerClass: 'text-right',
      cellClass: 'text-right',
      sortable: false,
      render: (row) => (
        <div className="flex items-center justify-end gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setViewingId(row.id);
            }}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-indigo-600 transition"
            title="View sale"
          >
            <Eye className="w-4 h-4" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              router.push(`/invoices/${row.invoiceNumber}`);
            }}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-indigo-600 transition"
            title="Open invoice"
          >
            <FileText className="w-4 h-4" />
          </button>
        </div>
      ),
    },
  ];

  if (creating) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Create New Sale"
          description="Build the invoice, apply discounts and record payment. Stock updates automatically on save."
          breadcrumbs={[
            { label: 'Dashboard', href: '/dashboard' },
            { label: 'Sales', href: '/sales' },
            { label: 'New Sale' },
          ]}
          actions={
            <Button variant="outline" icon={X} onClick={() => setCreating(false)}>
              Close Sale
            </Button>
          }
        />

        {customers.length === 0 ? (
          <EmptyState
            icon={ShoppingCart}
            title="Add a customer first"
            description="Sales require a customer profile to generate a GST-compliant invoice."
            actionLabel="Go to Customers"
            onAction={() => router.push('/customers?action=add')}
          />
        ) : (
          <CreateSaleForm
            customers={customers}
            onSubmit={handleCreateSale}
            onCancel={() => setCreating(false)}
            isSubmitting={isSubmitting}
          />
        )}
      </div>
    );
  }

  const pageValue = sales.reduce((acc, s) => acc + Number(s.grandTotal || 0), 0);
  const pageCollected = sales.reduce((acc, s) => acc + Number(s.paidAmount || 0), 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sales & POS"
        description="Review every transaction, track collections and create new sales in seconds."
        breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Sales' }]}
        actions={
          <Button
            variant="primary"
            icon={Plus}
            onClick={() => setCreating(true)}
            disabled={customers.length === 0}
          >
            New Sale
          </Button>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          label="Total Orders"
          value={formatNumber(metrics?.totalOrders ?? meta.total)}
          icon={ShoppingCart}
          tone="indigo"
        />
        <StatCard
          label="Gross Sales Value"
          value={formatCurrency(metrics?.totalSalesValue ?? 0)}
          hint="Including unpaid invoices"
          icon={TrendingUp}
          tone="sky"
        />
        <StatCard
          label="Amount Collected"
          value={formatCurrency(metrics?.totalRevenue ?? 0)}
          hint={
            metrics?.totalSalesValue > 0
              ? `${Math.round((metrics.totalRevenue / metrics.totalSalesValue) * 100)}% of gross sales`
              : '—'
          }
          icon={IndianRupee}
          tone="emerald"
        />
        <StatCard
          label="Receivables"
          value={formatCurrency(metrics?.totalOutstanding ?? 0)}
          hint={`${formatNumber(
            ((counts?.Pending ?? 0) + (counts?.Partial ?? 0) + (counts?.Overdue ?? 0))
          )} unpaid invoices`}
          icon={Receipt}
          tone="amber"
        />
      </div>

      {/* Toolbar */}
      <Card padded={false} bodyClassName="p-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <SearchInput
            value={search}
            onChange={resetPageAndSet(setSearch)}
            placeholder="Search invoice, customer or product..."
          />

          <div className="flex flex-wrap items-center gap-2">
            {PAYMENT_STATUSES.map((status) => (
              <FilterChip
                key={status}
                active={statusFilter === status}
                onClick={pickFilter(setStatusFilter)(status)}
                count={status === 'all' ? counts?.All : counts?.[status]}
              >
                {status === 'all' ? 'All' : status}
              </FilterChip>
            ))}

            <select
              value={methodFilter}
              onChange={(e) => resetPageAndSet(setMethodFilter)(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 focus:outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-500/20 cursor-pointer"
            >
              <option value="all">All methods</option>
              {['UPI', 'Cash', 'Bank Transfer', 'Cheque', 'Credit Card', 'COD'].map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
        </div>

        {sales.length > 0 && (
          <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-slate-500">
            <span>
              Showing <strong className="text-slate-800">{sales.length}</strong> of{' '}
              <strong className="text-slate-800">{meta.total}</strong> sales
            </span>
            <span>
              This page:{' '}
              <strong className="text-slate-800">{formatCurrency(pageValue)}</strong>
            </span>
            <span>
              Collected:{' '}
              <strong className="text-emerald-600">{formatCurrency(pageCollected)}</strong>
            </span>
          </div>
        )}
      </Card>

      {/* Table */}
      <DataTable
        columns={columns}
        data={sales}
        loading={isLoading}
        onRowClick={(row) => setViewingId(row.id)}
        page={page}
        perPage={PER_PAGE}
        total={meta.total}
        onPageChange={setPage}
        sortKey={sortBy}
        sortOrder="desc"
        onSortChange={(key) => {
          setPage(1);
          setSortBy(key);
        }}
        emptyState={
          <EmptyState
            icon={ShoppingCart}
            title="No sales found"
            description={
              search || statusFilter !== 'all' || methodFilter !== 'all'
                ? 'No sales match your current search or filter criteria.'
                : 'Create your first sale to see it listed here.'
            }
            actionLabel={search ? 'Clear filters' : 'Create Sale'}
            onAction={() => {
              if (search) {
                clearFilters();
              } else {
                setCreating(true);
              }
            }}
          />
        }
      />

      {/*
        A sale is a projection of its invoice row, so `GET /sales/:id` already
        returns every field the modal renders. The old code additionally looked
        up the matching invoice in a client-side array; there is nothing to look
        up now, and no separate fetch to make.
      */}
      <SaleDetailModal
        sale={saleDetail}
        onClose={() => setViewingId(null)}
        onViewInvoice={() => {
          if (saleDetail?.invoiceNumber) router.push(`/invoices/${saleDetail.invoiceNumber}`);
        }}
      />
    </div>
  );
}