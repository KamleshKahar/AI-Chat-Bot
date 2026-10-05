'use client';

import React, { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Printer,
  Wallet,
  FileText,
  Mail,
  Phone,
  Building2,
  Hash,
  CalendarClock,
  IndianRupee,
} from 'lucide-react';
import { useData } from '@/context/DataContext';
import { useToast } from '@/context/ToastContext';
import { useServerResource } from '@/hooks/useServerQuery';
import { formatCurrency, formatDate } from '@/lib/formatters';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/Badge';
import { PrintableInvoice } from '@/components/invoices/PrintableInvoice';
import { RecordPaymentModal } from '@/components/invoices/RecordPaymentModal';
import { EmptyState, LoadingSpinner } from '@/components/ui/StateFeedback';

export default function InvoiceDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const { updateInvoicePayment, revision } = useData();
  const { error } = useToast();
  const [paymentOpen, setPaymentOpen] = useState(false);

  /*
    The invoice is fetched by id rather than looked up in a client-side array.
    Two reasons: the list is server-paginated so the invoice is usually not in
    hand, and the record must be current — a payment recorded in another tab
    should be reflected here on reload.
  */
  const { data: invoice, isLoading, error: loadError } = useServerResource({
    path: `/invoices/${encodeURIComponent(id || '')}`,
    refreshKey: revision,
  });

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <LoadingSpinner text="Loading invoice..." />
      </div>
    );
  }

  if (loadError || !invoice) {
    return (
      <div className="space-y-6">
        <Button variant="outline" icon={ArrowLeft} onClick={() => router.push('/invoices')}>
          Back to Invoices
        </Button>

        <EmptyState
          icon={FileText}
          title="Invoice not found"
          description={`No invoice exists with the reference "${id}". It may have been deleted.`}
          actionLabel="Back to Invoices"
          onAction={() => router.push('/invoices')}
        />
      </div>
    );
  }

  const hasBalance = Number(invoice.balanceDue || 0) > 0;
  const isOverdue =
    invoice.paymentStatus !== 'Paid' &&
    new Date(`${invoice.dueDate}T23:59:59`).getTime() < Date.now();

  return (
    <div className="space-y-6">
      {/* Action bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 print:hidden">
        <div>
          <Link
            href="/invoices"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-indigo-600 transition mb-2"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Invoices
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 font-mono">{invoice.id}</h1>
            <StatusBadge status={invoice.paymentStatus} size="lg" />
            {isOverdue && <StatusBadge status="Overdue" size="lg" />}
          </div>
          <p className="text-sm text-slate-500 mt-1">
            {invoice.customer?.name} • {invoice.customer?.company || 'Walk-in Customer'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {hasBalance && (
            <Button variant="primary" icon={Wallet} onClick={() => setPaymentOpen(true)}>
              Record Payment
            </Button>
          )}
          <Button variant="outline" icon={Printer} onClick={() => window.print()}>
            Print Invoice
          </Button>
        </div>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 print:hidden">
        <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-2xs">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Invoice Total
          </p>
          <p className="mt-1.5 text-xl font-bold text-slate-900">{formatCurrency(invoice.grandTotal)}</p>
        </div>
        <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-2xs">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Amount Paid
          </p>
          <p className="mt-1.5 text-xl font-bold text-emerald-600">{formatCurrency(invoice.paidAmount)}</p>
        </div>
        <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-2xs">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Balance Due
          </p>
          <p
            className={`mt-1.5 text-xl font-bold ${
              hasBalance ? 'text-amber-600' : 'text-emerald-600'
            }`}
          >
            {formatCurrency(invoice.balanceDue)}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-2xs">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Due Date</p>
          <p className="mt-1.5 text-base font-bold text-slate-900">{formatDate(invoice.dueDate)}</p>
          {isOverdue && <p className="text-[11px] text-rose-600 font-semibold mt-0.5">Past due</p>}
        </div>
      </div>

      {/* Meta details */}
      <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-2xs print:hidden">
        <h3 className="text-sm font-semibold text-slate-900 mb-4">Invoice Metadata</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="flex items-start gap-2.5">
            <Hash className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Invoice No
              </p>
              <p className="text-sm font-mono font-medium text-slate-800">{invoice.id}</p>
            </div>
          </div>
          <div className="flex items-start gap-2.5">
            <FileText className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Sale Reference
              </p>
              <p className="text-sm font-mono font-medium text-slate-800">{invoice.saleId}</p>
            </div>
          </div>
          <div className="flex items-start gap-2.5">
            <CalendarClock className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Invoice Date
              </p>
              <p className="text-sm font-medium text-slate-800">{formatDate(invoice.date)}</p>
            </div>
          </div>
          <div className="flex items-start gap-2.5">
            <IndianRupee className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Payment Method
              </p>
              <p className="text-sm font-medium text-slate-800">{invoice.paymentMethod}</p>
            </div>
          </div>
          <div className="flex items-start gap-2.5">
            <Building2 className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Customer GSTIN
              </p>
              <p className="text-sm font-mono font-medium text-slate-800">
                {invoice.customer?.gstin || 'Unregistered'}
              </p>
            </div>
          </div>
          <div className="flex items-start gap-2.5">
            <Mail className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Contact
              </p>
              <p className="text-sm font-medium text-slate-800 truncate">{invoice.customer?.email}</p>
              <p className="text-xs text-slate-500">{invoice.customer?.phone}</p>
            </div>
          </div>
        </div>

        {/* The sale reference travels on the invoice itself, so no second lookup. */}
        {invoice.saleId && (
          <div className="mt-5 pt-4 border-t border-slate-100">
            <Link
              href={`/sales?search=${encodeURIComponent(invoice.saleId)}`}
              className="text-xs font-semibold text-indigo-600 hover:text-indigo-700"
            >
              View linked sale transaction &rarr;
            </Link>
          </div>
        )}
      </div>

      {/* Printable invoice */}
      <div className="print-area">
        <PrintableInvoice invoice={invoice} />
      </div>

      <RecordPaymentModal
        isOpen={paymentOpen}
        onClose={() => setPaymentOpen(false)}
        invoice={invoice}
        onSubmit={async (amount, method, reference) => {
          try {
            await updateInvoicePayment(invoice.id, amount, method, { reference });
            return true;
          } catch (err) {
            // Leave the dialog open on failure — the invoice may have been paid
            // from another session since this page loaded.
            error(err.message || 'Could not record the payment.');
            return false;
          }
        }}
      />
    </div>
  );
}