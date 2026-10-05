'use client';

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { UserPlus, Users, Wallet, UserCheck, Trash2, Eye, Pencil } from 'lucide-react';
import { useData } from '@/context/DataContext';
import { useToast } from '@/context/ToastContext';
import { useServerList, useServerResource, useDebouncedValue } from '@/hooks/useServerQuery';
import { formatCurrency, formatNumber } from '@/lib/formatters';
import { Button } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, StatCard } from '@/components/ui/Card';
import { DataTable } from '@/components/ui/DataTable';
import { SearchInput, FilterChip } from '@/components/ui/SearchInput';
import { EmptyState } from '@/components/ui/StateFeedback';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { CustomerFormModal } from '@/components/customers/CustomerFormModal';
import { CustomerDetailModal } from '@/components/customers/CustomerDetailModal';

const PER_PAGE = 10;

export default function CustomersPage() {
  const { addCustomer, updateCustomer, deleteCustomer, revision } = useData();
  const { success, error: errorToast } = useToast();

  // --- Server query state --------------------------------------------------
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('active');
  const [balanceFilter, setBalanceFilter] = useState('all');
  const [sortBy, setSortBy] = useState('name');
  const [page, setPage] = useState(1);

  const debouncedSearch = useDebouncedValue(search, 300);

  const query = useMemo(
    () => ({
      search: debouncedSearch.trim() || undefined,
      status: statusFilter === 'all' ? undefined : statusFilter,
      balance: balanceFilter === 'all' ? undefined : balanceFilter,
      sort: sortBy,
      order: sortBy === 'name' ? 'asc' : 'desc',
      page,
      limit: PER_PAGE,
    }),
    [debouncedSearch, statusFilter, balanceFilter, sortBy, page]
  );

  const { rows: customers, meta, isLoading } = useServerList({
    path: '/customers',
    query,
    refreshKey: revision,
  });

  const [formOpen, setFormOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [viewingId, setViewingId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const { data: customerDetail } = useServerResource({
    path: viewingId ? `/customers/${encodeURIComponent(viewingId)}` : null,
    enabled: Boolean(viewingId),
    refreshKey: revision,
  });

  // Deep links. The dashboard's "Add Customer" quick action and the sales empty
  // state both navigate here with ?action=add, so this page has to honour it the
  // way /inventory and /sales do.
  //
  // Keyed on the serialized query string and guarded by a ref, because
  // `searchParams` is a fresh object on some navigations — without the guard the
  // effect would re-open the form after the user closes it.
  const searchParams = useSearchParams();
  const rawQuery = searchParams.toString();
  const handledQuery = useRef(null);

  useEffect(() => {
    if (handledQuery.current === rawQuery) return;
    handledQuery.current = rawQuery;

    if (searchParams.get('action') === 'add') {
      setEditingCustomer(null);
      setFormOpen(true);
    }
  }, [rawQuery, searchParams]);

  // A new filter or search always invalidates the current page number.
  //
  // Two shapes, deliberately. `resetPageAndSet` is a plain `onChange` handler —
  // SearchInput passes the new value in. `pickFilter` *builds* an onClick
  // handler. Writing `onClick={resetPageAndSet(setStatusFilter)('active')}`
  // instead would call the returned function during render, making its
  // `setPage(1)` a render-phase update: React throws "Too many re-renders" and
  // the page never paints.
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
    setStatusFilter('active');
    setBalanceFilter('all');
    setPage(1);
  };

  const handleSave = async (data) => {
    try {
      if (editingCustomer) {
        await updateCustomer(editingCustomer.id, data);
        success(`Customer "${data.name}" updated`);
      } else {
        await addCustomer(data);
        success(`Customer "${data.name}" added`);
      }
      setFormOpen(false);
      setEditingCustomer(null);
      setViewingId(null);
    } catch (err) {
      errorToast(err.message || 'Could not save the customer.');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const name = deleteTarget.name;
    try {
      await deleteCustomer(deleteTarget.id);
      success(`Customer "${name}" deleted`);
      if (viewingId === deleteTarget.id) setViewingId(null);
    } catch (err) {
      errorToast(err.message || 'Could not delete the customer.');
    } finally {
      setDeleteTarget(null);
    }
  };

  // Card stats reflect the current page of rows, which is what the server
  // returns. Labelled as such rather than presented as company-wide totals.
  const pageOutstanding = customers.reduce(
    (acc, c) => acc + Number(c.outstandingBalance || 0),
    0
  );
  const pageActive = customers.filter((c) => c.status === 'active').length;

  const columns = [
    {
      key: 'name',
      header: 'Customer',
      accessor: 'name',
      render: (row) => (
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-indigo-50 text-indigo-600 border border-indigo-100 flex items-center justify-center font-semibold text-xs shrink-0">
            {row.name
              .split(' ')
              .map((n) => n[0])
              .slice(0, 2)
              .join('')
              .toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-slate-900 truncate">{row.name}</p>
            <p className="text-xs text-slate-500 truncate">{row.company || row.email}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'phone',
      header: 'Contact',
      render: (row) => (
        <div className="min-w-0">
          <p className="text-sm text-slate-700">{row.phone}</p>
          <p className="text-xs text-slate-500 truncate">{row.email}</p>
        </div>
      ),
    },
    {
      key: 'totalPurchases',
      header: 'Orders',
      accessor: 'totalPurchases',
      render: (row) => (
        <span className="text-sm text-slate-700">{formatNumber(row.totalPurchases ?? 0)}</span>
      ),
    },
    {
      key: 'totalSpent',
      header: 'Lifetime Value',
      accessor: 'totalSpent',
      render: (row) => (
        <span className="font-semibold text-slate-900">{formatCurrency(row.totalSpent)}</span>
      ),
    },
    {
      key: 'outstandingBalance',
      header: 'Outstanding',
      accessor: 'outstandingBalance',
      render: (row) => (
        <span
          className={`font-semibold ${
            Number(row.outstandingBalance) > 0 ? 'text-amber-600' : 'text-emerald-600'
          }`}
        >
          {formatCurrency(row.outstandingBalance)}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
            row.status === 'active'
              ? 'bg-emerald-50 text-emerald-700'
              : 'bg-slate-100 text-slate-600'
          }`}
        >
          {row.status === 'active' ? 'Active' : 'Inactive'}
        </span>
      ),
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
            title="View customer"
          >
            <Eye className="w-4 h-4" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setEditingCustomer(row);
              setFormOpen(true);
            }}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-indigo-600 transition"
            title="Edit customer"
          >
            <Pencil className="w-4 h-4" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setDeleteTarget(row);
            }}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition"
            title="Delete customer"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Customers"
        description="Manage customer records, outstanding balances and purchase history."
        breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Customers' }]}
        actions={
          <Button
            variant="primary"
            icon={UserPlus}
            onClick={() => {
              setEditingCustomer(null);
              setFormOpen(true);
            }}
          >
            Add Customer
          </Button>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          label="Customers (filtered)"
          value={formatNumber(meta.total ?? customers.length)}
          icon={Users}
          tone="indigo"
        />
        <StatCard
          label="Active (this page)"
          value={formatNumber(pageActive)}
          icon={UserCheck}
          tone="sky"
        />
        <StatCard
          label="Outstanding (this page)"
          value={formatCurrency(pageOutstanding)}
          icon={Wallet}
          tone="amber"
        />
        <StatCard
          label="Lifetime Value (this page)"
          value={formatCurrency(
            customers.reduce((acc, c) => acc + Number(c.totalSpent || 0), 0)
          )}
          icon={Users}
          tone="emerald"
        />
      </div>

      {/* Toolbar */}
      <Card padded={false} bodyClassName="p-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <SearchInput
            value={search}
            onChange={resetPageAndSet(setSearch)}
            placeholder="Search by name, company, email or phone..."
          />

          <div className="flex flex-wrap items-center gap-2">
            <FilterChip
              active={statusFilter === 'active'}
              onClick={pickFilter(setStatusFilter)('active')}
            >
              Active
            </FilterChip>
            <FilterChip
              active={statusFilter === 'inactive'}
              onClick={pickFilter(setStatusFilter)('inactive')}
            >
              Inactive
            </FilterChip>
            <FilterChip
              active={statusFilter === 'all'}
              onClick={pickFilter(setStatusFilter)('all')}
            >
              All
            </FilterChip>

            <span className="w-px h-5 bg-slate-200 mx-1" aria-hidden="true" />

            <FilterChip
              active={balanceFilter === 'has_dues'}
              onClick={pickFilter(setBalanceFilter)('has_dues')}
            >
              Has dues
            </FilterChip>
            <FilterChip
              active={balanceFilter === 'clear'}
              onClick={pickFilter(setBalanceFilter)('clear')}
            >
              Clear
            </FilterChip>
          </div>
        </div>
      </Card>

      {/* Table */}
      <DataTable
        columns={columns}
        data={customers}
        loading={isLoading}
        onRowClick={(row) => setViewingId(row.id)}
        page={page}
        perPage={PER_PAGE}
        total={meta.total}
        onPageChange={setPage}
        sortKey={sortBy}
        sortOrder={sortBy === 'name' ? 'asc' : 'desc'}
        onSortChange={(key) => {
          setPage(1);
          setSortBy(key);
        }}
        emptyState={
          <EmptyState
            icon={Users}
            title="No customers found"
            description="No customers match your current search or filter criteria."
            actionLabel="Clear filters"
            onAction={clearFilters}
          />
        }
      />

      {/* Modals */}
      <CustomerFormModal
        isOpen={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditingCustomer(null);
        }}
        onSubmit={handleSave}
        initialData={editingCustomer}
      />

      {customerDetail?.customer && (
        <CustomerDetailModal
          customer={customerDetail.customer}
          purchases={customerDetail.purchases ?? []}
          onClose={() => setViewingId(null)}
          onEdit={() => {
            setEditingCustomer(customerDetail.customer);
            setViewingId(null);
            setFormOpen(true);
          }}
          onDelete={() => setDeleteTarget(customerDetail.customer)}
        />
      )}

      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete customer?"
        message={`"${deleteTarget?.name}" will be removed from your customer records. Historical invoices are retained.`}
        confirmText="Delete Customer"
      />
    </div>
  );
}