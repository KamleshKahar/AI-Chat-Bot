'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { RotateCcw, Eye, Printer, Undo2 } from 'lucide-react';
import { useData } from '@/context/DataContext';
import { useToast } from '@/context/ToastContext';
import { useServerList, useDebouncedValue } from '@/hooks/useServerQuery';
import { formatCurrency, formatDate, formatNumber } from '@/lib/formatters';
import { Button } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, StatCard } from '@/components/ui/Card';
import { DataTable } from '@/components/ui/DataTable';
import { SearchInput, FilterChip } from '@/components/ui/SearchInput';
import { EmptyState } from '@/components/ui/StateFeedback';
import { Modal } from '@/components/ui/Modal';
import { PrintableCreditNote } from '@/components/credit-notes/PrintableCreditNote';

const PER_PAGE = 10;

/**
 * Credit notes register.
 *
 * Every row is a return document issued against an invoice: it reverses value
 * (goods + GST) and restocks inventory. Money on this page is always read from
 * the server's stored note — there is no client-side recalculation to drift.
 */
export default function CreditNotesPage() {
  const { revision, deleteCreditNote } = useData();
  const { error: errorToast, success } = useToast();

  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('date');
  const [page, setPage] = useState(1);
  const [previewNote, setPreviewNote] = useState(null);

  const debouncedSearch = useDebouncedValue(search, 300);

  const query = useMemo(
    () => ({
      search: debouncedSearch.trim() || undefined,
      sort: sortBy,
      order: 'desc',
      page,
      limit: PER_PAGE,
    }),
    [debouncedSearch, sortBy, page]
  );

  const { rows: notes, meta, isLoading } = useServerList({
    path: '/credit-notes',
    query,
    refreshKey: revision,
  });

  const resetPageAndSet = (setter) => (value) => {
    setPage(1);
    setter(value);
  };

  // Cards describe the current page of rows, and are labelled as such.
  const stats = useMemo(() => {
    const totalCredited = notes.reduce((acc, n) => acc + Number(n.grandTotal || 0), 0);
    const totalTax = notes.reduce((acc, n) => acc + Number(n.taxAmount || 0), 0);
    const units = notes.reduce(
      (acc, n) => acc + (n.items || []).reduce((a, i) => a + Number(i.quantity || 0), 0),
      0
    );
    return { totalCredited, totalTax, units };
  }, [notes]);

  const handlePrint = (note) => {
    setPreviewNote(note);
    setTimeout(() => window.print(), 350);
  };

  /*
   * Full reversal is an ADMIN-only, endpoint-gated operation. Confirm first —
   * it shrinks stock and re-opens the invoice balance, and an accidental click
   * would be visible in two places at once.
   */
  const handleDelete = async (note) => {
    if (!window.confirm(`Reverse credit note ${note.id} in full? Stock and the invoice balance will be restored.`)) {
      return;
    }
    try {
      await deleteCreditNote(note.id);
      success(`Credit note ${note.id} reversed`);
    } catch (err) {
      errorToast(err.message || 'Could not reverse the credit note.');
    }
  };

  const columns = [
    {
      key: 'id',
      header: 'Credit Note',
      accessor: 'id',
      render: (row) => (
        <div className="min-w-0">
          <p className="font-mono font-semibold text-slate-900 text-xs">{row.id}</p>
          <p className="text-[11px] text-slate-500">{formatDate(row.date)}</p>
        </div>
      ),
    },
    {
      key: 'invoiceId',
      header: 'Against Invoice',
      accessor: 'invoiceId',
      render: (row) => (
        <Link
          href={`/invoices/${row.invoiceId}`}
          onClick={(e) => e.stopPropagation()}
          className="font-mono text-xs font-semibold text-indigo-600 hover:underline"
        >
          {row.invoiceId}
        </Link>
      ),
    },
    {
      key: 'customer',
      header: 'Customer',
      render: (row) => (
        <div className="min-w-0">
          <p className="font-semibold text-slate-900 truncate">{row.customer?.name}</p>
          <p className="text-xs text-slate-500 truncate">
            {row.customer?.company || 'Walk-in'}
          </p>
        </div>
      ),
    },
    {
      key: 'taxAmount',
      header: 'GST Reversed',
      accessor: 'taxAmount',
      render: (row) => (
        <span className="text-slate-600 whitespace-nowrap">
          {formatCurrency(row.taxAmount)}
        </span>
      ),
    },
    {
      key: 'grandTotal',
      header: 'Credit Value',
      accessor: 'grandTotal',
      render: (row) => (
        <span className="font-bold text-rose-600 whitespace-nowrap">
          − {formatCurrency(row.grandTotal)}
        </span>
      ),
    },
    {
      key: 'reason',
      header: 'Reason',
      render: (row) => (
        <span className="text-xs text-slate-500 truncate block max-w-[180px]">
          {row.reason || '—'}
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
          <Link
            href={`/credit-notes/${row.id}`}
            onClick={(e) => e.stopPropagation()}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-indigo-600 transition"
            title="View credit note"
          >
            <Eye className="w-4 h-4" />
          </Link>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handlePrint(row);
            }}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-indigo-600 transition"
            title="Print credit note"
          >
            <Printer className="w-4 h-4" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleDelete(row);
            }}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition"
            title="Reverse credit note (full)"
          >
            <Undo2 className="w-4 h-4" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Credit Notes"
        description="Return documents that reverse invoiced value, restock goods and reduce customer balances."
        breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Credit Notes' }]}
        actions={
          <Button
            variant="outline"
            icon={Printer}
            onClick={() => setPreviewNote(notes[0] ?? null)}
            disabled={notes.length === 0}
          >
            Quick Preview
          </Button>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label="Credited (this page)"
          value={formatCurrency(stats.totalCredited)}
          hint={`${formatNumber(meta.total)} credit notes`}
          icon={RotateCcw}
          tone="rose"
        />
        <StatCard
          label="GST Reversed (this page)"
          value={formatCurrency(stats.totalTax)}
          hint="Tax credited back to customers"
          icon={RotateCcw}
          tone="amber"
        />
        <StatCard
          label="Units Returned (this page)"
          value={formatNumber(stats.units)}
          hint="Restocked automatically on issue"
          icon={Undo2}
          tone="emerald"
        />
      </div>

      {/* Toolbar */}
      <Card padded={false} bodyClassName="p-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <SearchInput
            value={search}
            onChange={resetPageAndSet(setSearch)}
            placeholder="Search credit note number, invoice, customer or reason..."
          />

          <div className="flex flex-wrap items-center gap-2">
            <FilterChip active={sortBy === 'date'} onClick={() => { setPage(1); setSortBy('date'); }}>
              Newest first
            </FilterChip>
            <FilterChip active={sortBy === 'amount'} onClick={() => { setPage(1); setSortBy('amount'); }}>
              By amount
            </FilterChip>
          </div>
        </div>
      </Card>

      {/* Table */}
      <DataTable
        columns={columns}
        data={notes}
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
            icon={RotateCcw}
            title="No credit notes found"
            description="Credit notes are issued from an invoice when goods are returned."
            actionLabel={search ? 'Clear filters' : undefined}
            onAction={() => {
              setSearch('');
              setPage(1);
            }}
          />
        }
      />

      {/* Print preview modal */}
      {previewNote && (
        <Modal
          isOpen={!!previewNote}
          onClose={() => setPreviewNote(null)}
          title={`Credit Note ${previewNote.id}`}
          description="Print preview"
          size="xl"
          maxWidth="max-w-4xl"
        >
          <div className="mb-4 flex justify-end gap-2 print:hidden">
            <Button variant="outline" icon={Printer} onClick={() => window.print()}>
              Print Credit Note
            </Button>
            <Link href={`/credit-notes/${previewNote.id}`}>
              <Button variant="primary">Open Full Note</Button>
            </Link>
          </div>

          <div className="print-container">
            <PrintableCreditNote
              note={notes.find((n) => n.id === previewNote.id) || previewNote}
            />
          </div>
        </Modal>
      )}
    </div>
  );
}
