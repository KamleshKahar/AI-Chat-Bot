'use client';

import React from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Printer,
  RotateCcw,
  FileText,
  Hash,
  CalendarClock,
  Building2,
  MessageSquareText,
  Undo2,
} from 'lucide-react';
import { useData } from '@/context/DataContext';
import { useToast } from '@/context/ToastContext';
import { useAuth } from '@/context/AuthContext';
import { useServerResource } from '@/hooks/useServerQuery';
import { formatCurrency, formatDate, formatNumber } from '@/lib/formatters';
import { Button } from '@/components/ui/Button';
import { PrintableCreditNote } from '@/components/credit-notes/PrintableCreditNote';
import { EmptyState, LoadingSpinner } from '@/components/ui/StateFeedback';

/**
 * Single credit note: summary + the printable document.
 *
 * The note is fetched by its CRN code rather than looked up in the list —
 * the register is server-paginated, and a reversal issued in another tab
 * must show up here on reload (the list invalidation bumps `revision`).
 */
export default function CreditNoteDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const { revision, deleteCreditNote } = useData();
  const { can } = useAuth();
  const { success, error } = useToast();

  const { data: note, isLoading, error: loadError } = useServerResource({
    path: `/credit-notes/${encodeURIComponent(id || '')}`,
    refreshKey: revision,
  });

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <LoadingSpinner text="Loading credit note..." />
      </div>
    );
  }

  if (loadError || !note) {
    return (
      <div className="space-y-6">
        <Button variant="outline" icon={ArrowLeft} onClick={() => router.push('/credit-notes')}>
          Back to Credit Notes
        </Button>

        <EmptyState
          icon={RotateCcw}
          title="Credit note not found"
          description={`No credit note exists with the reference "${id}". It may have been reversed.`}
          actionLabel="Back to Credit Notes"
          onAction={() => router.push('/credit-notes')}
        />
      </div>
    );
  }

  const unitsReturned = (note.items || []).reduce(
    (acc, item) => acc + Number(item.quantity || 0),
    0
  );
  const isInterState = note.taxType === 'IGST';

  /*
   * Full reversal is ADMIN-only and gated endpoint-side too (DELETE requires
   * `company:write`). Confirm first: it shrinks stock and re-opens the invoice
   * balance, both visible elsewhere immediately.
   */
  const handleReverse = async () => {
    const ok = window.confirm(
      `Reverse credit note ${note.id} in full? Stock will be removed again and invoice ${note.invoiceId} will show the value as outstanding.`
    );
    if (!ok) return;

    try {
      await deleteCreditNote(note.id);
      success(`Credit note ${note.id} reversed`);
      router.push('/credit-notes');
    } catch (err) {
      error(err.message || 'Could not reverse the credit note.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Action bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 print:hidden">
        <div>
          <Link
            href="/credit-notes"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-indigo-600 transition mb-2"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Credit Notes
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 font-mono">
              {note.id}
            </h1>
            <span className="rounded-full bg-rose-50 border border-rose-200 px-2.5 py-0.5 text-[11px] font-semibold text-rose-700">
              Return document
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            {note.customer?.name} • against invoice{' '}
            <Link
              href={`/invoices/${note.invoiceId}`}
              className="font-mono font-semibold text-indigo-600 hover:underline"
            >
              {note.invoiceId}
            </Link>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {can('company:write') && (
            <Button variant="outline" icon={Undo2} onClick={handleReverse}>
              Reverse Note
            </Button>
          )}
          <Button variant="outline" icon={Printer} onClick={() => window.print()}>
            Print Credit Note
          </Button>
        </div>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 print:hidden">
        <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-2xs">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Credit Value
          </p>
          <p className="mt-1.5 text-xl font-bold text-rose-600">
            − {formatCurrency(note.grandTotal)}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-2xs">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            GST Reversed
          </p>
          <p className="mt-1.5 text-xl font-bold text-amber-600">
            {formatCurrency(note.taxAmount)}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-2xs">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Units Returned
          </p>
          <p className="mt-1.5 text-xl font-bold text-emerald-600">
            {formatNumber(unitsReturned)}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-2xs">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Credit Date
          </p>
          <p className="mt-1.5 text-base font-bold text-slate-900">{formatDate(note.date)}</p>
        </div>
      </div>

      {/* Meta details */}
      <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-2xs print:hidden">
        <h3 className="text-sm font-semibold text-slate-900 mb-4">Credit Note Metadata</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="flex items-start gap-2.5">
            <Hash className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Credit Note No
              </p>
              <p className="text-sm font-mono font-medium text-slate-800">{note.id}</p>
            </div>
          </div>
          <div className="flex items-start gap-2.5">
            <FileText className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Against Invoice
              </p>
              <p className="text-sm font-mono font-medium text-slate-800">{note.invoiceId}</p>
            </div>
          </div>
          <div className="flex items-start gap-2.5">
            <CalendarClock className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Credit Date
              </p>
              <p className="text-sm font-medium text-slate-800">{formatDate(note.date)}</p>
            </div>
          </div>
          <div className="flex items-start gap-2.5">
            <Building2 className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Tax Type
              </p>
              <p className="text-sm font-medium text-slate-800">
                {isInterState ? 'IGST (Inter-state)' : 'CGST + SGST (Intra-state)'}
              </p>
            </div>
          </div>
          {note.reason && (
            <div className="flex items-start gap-2.5 sm:col-span-2 lg:col-span-4">
              <MessageSquareText className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Reason
                </p>
                <p className="text-sm text-slate-700">{note.reason}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Printable credit note */}
      <div className="print-area">
        <PrintableCreditNote note={note} />
      </div>
    </div>
  );
}
