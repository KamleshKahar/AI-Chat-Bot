'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import {
  FileText,
  IndianRupee,
  Clock,
  CheckCircle2,
  Eye,
  Printer,
  Download,
  Wallet,
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
import { RecordPaymentModal } from '@/components/invoices/RecordPaymentModal';
import { PrintableInvoice } from '@/components/invoices/PrintableInvoice';
import { Modal } from '@/components/ui/Modal';

const PER_PAGE = 10;

export default function InvoicesPage() {
  const { updateInvoicePayment, revision } = useData();
  const { error: errorToast } = useToast();

  // --- Server query state --------------------------------------------------
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState('date');
  const [page, setPage] = useState(1);
  const [payingInvoice, setPayingInvoice] = useState(null);
  const [previewInvoice, setPreviewInvoice] = useState(null);

  const debouncedSearch = useDebouncedValue(search, 300);

  const query = useMemo(
    () => ({
      search: debouncedSearch.trim() || undefined,
      paymentStatus: statusFilter === 'all' ? undefined : statusFilter,
      sort: sortBy,
      order: 'desc',
      page,
      limit: PER_PAGE,
    }),
    [debouncedSearch, statusFilter, sortBy, page]
  );

  const { rows: invoices, meta, counts, isLoading } = useServerList({
    path: '/invoices',
    query,
    refreshKey: revision,
  });

  const { data: summary } = useServerResource({ path: '/dashboard/summary', refreshKey: revision });
  const metrics = summary?.metrics ?? null;

  // A new filter or search always invalidates the current page number.
  //
  // Two shapes, deliberately. `resetPageAndSet` is a plain `onChange` handler —
  // SearchInput passes the new value in. `pickFilter` *builds* an onClick
  // handler. Writing `onClick={resetPageAndSet(setStatusFilter)(status)}`
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

  /*
    Keep the dialog open on failure. Recording a payment can be rejected — most
    often because the amount exceeds the outstanding balance — and silently
    closing the modal would tell the cashier it worked.
  */
  const handleRecordPayment = async (amount, method, reference) => {
    try {
      await updateInvoicePayment(payingInvoice.id, amount, method, { reference });
      setPayingInvoice(null);
      return true;
    } catch (err) {
      errorToast(err.message || 'Could not record the payment.');
      return false;
    }
  };

  // Card figures describe the current page of rows, and are labelled as such.
  const stats = useMemo(() => {
    const totalBilled = invoices.reduce((acc, i) => acc + Number(i.grandTotal || 0), 0);
    const totalCollected = invoices.reduce((acc, i) => acc + Number(i.paidAmount || 0), 0);
    const totalDue = invoices.reduce((acc, i) => acc + Number(i.balanceDue || 0), 0);

    return { totalBilled, totalCollected, totalDue };
  }, [invoices]);

  const handlePrint = (invoice) => {
    setPreviewInvoice(invoice);
    // Allow the preview modal to render before triggering print
    setTimeout(() => window.print(), 350);
  };

  const columns = [
    {
      key: 'id',
      header: 'Invoice',
      accessor: 'id',
      render: (row) => (
        <div className="min-w-0">
          <p className="font-mono font-semibold text-slate-900 text-xs">{row.id}</p>
          <p className="text-[11px] text-slate-500">
            {formatDate(row.date)} • Due {formatDate(row.dueDate)}
          </p>
        </div>
      ),
    },
    {
      key: 'customer',
      header: 'Customer',
      render: (row) => (
        <div className="min-w-0">
          <p className="font-semibold text-slate-900 truncate">{row.customer?.name}</p>
          <p className="text-xs text-slate-500 truncate">{row.customer?.company || 'Walk-in'}</p>
        </div>
      ),
    },
    {
      key: 'grandTotal',
      header: 'Amount',
      accessor: 'grandTotal',
      render: (row) => (
        <span className="font-bold text-slate-900 whitespace-nowrap">
          {formatCurrency(row.grandTotal)}
        </span>
      ),
    },
    {
      key: 'paidAmount',
      header: 'Paid',
      accessor: 'paidAmount',
      render: (row) => (
        <span className="text-slate-600 whitespace-nowrap">{formatCurrency(row.paidAmount)}</span>
      ),
    },
    {
      key: 'balanceDue',
      header: 'Balance Due',
      accessor: 'balanceDue',
      render: (row) =>
        Number(row.balanceDue) > 0 ? (
          <span className="font-semibold text-amber-600 whitespace-nowrap">
            {formatCurrency(row.balanceDue)}
          </span>
        ) : (
          <span className="text-xs text-emerald-600 font-medium">Fully paid</span>
        ),
    },
    {
      key: 'paymentStatus',
      header: 'Status',
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
          {Number(row.balanceDue) > 0 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setPayingInvoice(row);
              }}
              className="rounded-lg px-2 py-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 transition"
              title="Record payment"
            >
              Pay
            </button>
          )}
          <Link
            href={`/invoices/${row.id}`}
            onClick={(e) => e.stopPropagation()}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-indigo-600 transition"
            title="View invoice"
          >
            <Eye className="w-4 h-4" />
          </Link>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handlePrint(row);
            }}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-indigo-600 transition"
            title="Print invoice"
          >
            <Printer className="w-4 h-4" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Invoices"
        description="GST-ready tax invoices with print-ready layouts and payment tracking."
        breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Invoices' }]}
        actions={
          <Button
            variant="outline"
            icon={Download}
            onClick={() => setPreviewInvoice(invoices[0] ?? null)}
            disabled={invoices.length === 0}
          >
            Quick Preview
          </Button>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          label="Total Invoiced"
          value={formatCurrency(metrics?.totalSalesValue ?? stats.totalBilled)}
          hint={`${formatNumber(meta.total)} invoices raised`}
          icon={FileText}
          tone="indigo"
        />
        <StatCard
          label="Collected"
          value={formatCurrency(metrics?.totalRevenue ?? stats.totalCollected)}
          hint={`${formatNumber(counts?.Paid ?? 0)} fully settled invoices`}
          icon={CheckCircle2}
          tone="emerald"
        />
        <StatCard
          label="Outstanding"
          value={formatCurrency(metrics?.totalOutstanding ?? stats.totalDue)}
          hint={`${formatNumber(counts?.Pending ?? 0)} pending • ${formatNumber(
            counts?.Partial ?? 0
          )} partial`}
          icon={Clock}
          tone="amber"
        />
        <StatCard
          label="Overdue"
          value={formatCurrency(metrics?.totalOverdue ?? 0)}
          hint={`${formatNumber(counts?.Overdue ?? 0)} invoice(s) past due date`}
          icon={Wallet}
          tone="rose"
        />
      </div>

      {/* Toolbar */}
      <Card padded={false} bodyClassName="p-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <SearchInput
            value={search}
            onChange={resetPageAndSet(setSearch)}
            placeholder="Search invoice number, sale ref, customer or GSTIN..."
          />

          <div className="flex flex-wrap items-center gap-2">
            {['all', 'Paid', 'Partial', 'Pending', 'Overdue'].map((status) => (
              <FilterChip
                key={status}
                active={statusFilter === status}
                onClick={pickFilter(setStatusFilter)(status)}
                count={status === 'all' ? counts?.All : counts?.[status]}
              >
                {status === 'all' ? 'All' : status}
              </FilterChip>
            ))}
          </div>
        </div>
      </Card>

      {/* Table */}
      <DataTable
        columns={columns}
        data={invoices}
        loading={isLoading}
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
            icon={FileText}
            title="No invoices found"
            description="Invoices are generated automatically when you record a sale."
            actionLabel={search ? 'Clear filters' : undefined}
            onAction={() => {
              setSearch('');
              setStatusFilter('all');
              setPage(1);
            }}
          />
        }
      />

      {/* Payment modal */}
      <RecordPaymentModal
        isOpen={!!payingInvoice}
        onClose={() => setPayingInvoice(null)}
        invoice={payingInvoice ? invoices.find((i) => i.id === payingInvoice.id) : null}
        onSubmit={handleRecordPayment}
      />

      {/* Print preview modal */}
      {previewInvoice && (
        <Modal
          isOpen={!!previewInvoice}
          onClose={() => setPreviewInvoice(null)}
          title={`Invoice ${previewInvoice.id}`}
          description="Print preview"
          size="xl"
          maxWidth="max-w-4xl"
        >
          <div className="mb-4 flex justify-end gap-2 print:hidden">
            <Button
              variant="outline"
              icon={Printer}
              onClick={() => window.print()}
            >
              Print Invoice
            </Button>
            <Link href={`/invoices/${previewInvoice.id}`}>
              <Button variant="primary">Open Full Invoice</Button>
            </Link>
          </div>

          <div className="print-container">
            <PrintableInvoice
              invoice={invoices.find((i) => i.id === previewInvoice.id) || previewInvoice}
            />
          </div>
        </Modal>
      )}
    </div>
  );
}