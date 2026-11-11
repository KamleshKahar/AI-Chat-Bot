'use client';

import React, { useState, useEffect } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/context/ToastContext';
import { formatCurrency } from '@/lib/formatters';
import { computeCreditNoteTotals } from '@/lib/salesLogic';

/**
 * Issue a credit note (return document) against an invoice.
 *
 * The payload deliberately carries only line + quantity choices: the server
 * prices every line from the STORED invoice (unit price, GST slab, discount
 * share), restocks inventory and reduces the invoice balance in one
 * transaction. This modal's totals are a live preview of the same maths
 * (`lib/salesLogic.js#computeCreditNoteTotals`), so what the user confirms is
 * what gets issued.
 */
export function CreateCreditNoteModal({ isOpen, onClose, invoice, onSubmit }) {
  const { success, error: toastError } = useToast();

  // Hook order must not depend on `invoice` — the parent renders this with a
  // null invoice before the first fetch resolves (see RecordPaymentModal).
  const [quantities, setQuantities] = useState({});
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setQuantities({});
      setReason('');
      setErrors({});
      setSubmitting(false);
    }
  }, [isOpen]);

  if (!invoice) return null;

  const items = invoice.items || [];
  const isInterState = invoice.taxType === 'IGST';

  const preview = computeCreditNoteTotals({
    items: items.map((item) => ({
      ...item,
      creditedQuantity: Number(quantities[String(item.id)] || 0),
    })),
    taxType: invoice.taxType || 'CGST_SGST',
  });

  const setQuantity = (id, value) => {
    const key = String(id);
    const qty = Math.max(0, Math.floor(Number(value || 0)));
    setQuantities((prev) => ({ ...prev, [key]: qty }));
    setErrors((prev) => ({ ...prev, items: '' }));
  };

  const creditAll = () => {
    const next = {};
    items.forEach((item) => {
      next[String(item.id)] = Number(item.quantity || 0);
    });
    setQuantities(next);
  };

  const handleSubmit = async () => {
    const selected = items
      .map((item) => ({
        invoiceItemId: Number(item.id),
        quantity: Number(quantities[String(item.id)] || 0),
      }))
      .filter((line) => line.quantity > 0);

    const nextErrors = {};
    if (selected.length === 0) {
      nextErrors.items = 'Select at least one line to credit';
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitting(true);
    try {
      const ok = await onSubmit({
        items: selected,
        reason: reason.trim() || undefined,
      });
      // The parent returns false when it already surfaced the error.
      if (ok === false) return;

      success(`Credit note issued against ${invoice.id}`);
      setQuantities({});
      setReason('');
      onClose();
    } catch (err) {
      // 422s carry field-keyed details (e.g. "only 2 units remain
      // returnable"); show the message, which is already human-readable.
      toastError(err.message || 'Failed to issue credit note');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Create Credit Note"
      description={`Partial or full return against invoice ${invoice.id}`}
      size="lg"
      maxWidth="max-w-3xl"
    >
      {/* Invoice summary */}
      <div className="rounded-lg bg-slate-50 border border-slate-200 px-4 py-3 mb-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Invoice Total
            </p>
            <p className="font-semibold text-slate-900 mt-0.5">
              {formatCurrency(invoice.grandTotal)}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Paid
            </p>
            <p className="font-semibold text-emerald-600 mt-0.5">
              {formatCurrency(invoice.paidAmount)}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Already Credited
            </p>
            <p className="font-semibold text-rose-600 mt-0.5">
              {formatCurrency(invoice.creditedAmount || 0)}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Balance Due
            </p>
            <p className="font-bold text-amber-600 mt-0.5">
              {formatCurrency(invoice.balanceDue)}
            </p>
          </div>
        </div>
      </div>

      {/* Line picker */}
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
          Lines to credit
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={creditAll}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
          >
            Credit all
          </button>
          <button
            type="button"
            onClick={() => setQuantities({})}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
          >
            Clear
          </button>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 overflow-hidden">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-3 py-2.5">Product</th>
              <th className="px-3 py-2.5 text-center">Invoiced</th>
              <th className="px-3 py-2.5 text-right">Unit Price</th>
              <th className="px-3 py-2.5 text-right">GST %</th>
              <th className="px-3 py-2.5 text-center w-28">Credit Qty</th>
              <th className="px-3 py-2.5 text-right">Credit Value</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map((item) => {
              const qty = Number(quantities[String(item.id)] || 0);
              const line = preview.lines.find(
                (l) => String(l.invoiceItemId) === String(item.id)
              );
              return (
                <tr key={String(item.id)} className="hover:bg-slate-50/60">
                  <td className="px-3 py-2.5">
                    <p className="font-semibold text-slate-800">{item.productName}</p>
                    <p className="text-[11px] text-slate-400 font-mono">
                      {item.sku}
                      {item.hsnCode ? ` • HSN ${item.hsnCode}` : ''}
                    </p>
                  </td>
                  <td className="px-3 py-2.5 text-center text-slate-600">
                    {item.quantity}
                  </td>
                  <td className="px-3 py-2.5 text-right text-slate-600">
                    {formatCurrency(item.unitPrice)}
                  </td>
                  <td className="px-3 py-2.5 text-right text-slate-600">
                    {Number(item.taxRate ?? invoice.taxRate ?? 0)}%
                  </td>
                  <td className="px-3 py-2.5">
                    <input
                      type="number"
                      min="0"
                      max={Number(item.quantity || 0)}
                      value={quantities[String(item.id)] ?? ''}
                      placeholder="0"
                      onChange={(e) => setQuantity(item.id, e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-center font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    />
                  </td>
                  <td className="px-3 py-2.5 text-right font-semibold text-slate-900">
                    {line
                      ? formatCurrency(line.taxableValue + line.taxAmount)
                      : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {errors.items && (
        <p className="mt-3 rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-xs font-medium text-rose-700">
          {errors.items}
        </p>
      )}

      {/* Preview + reason */}
      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5 text-sm">
          <p className="text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
            Reason (optional)
          </p>
          <textarea
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Damaged in transit, wrong item delivered, customer returned goods..."
            className="w-full rounded-lg border border-slate-300 text-sm text-slate-900 placeholder-slate-400 transition-colors hover:border-slate-400 focus:outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-500/20 px-3 py-2"
          />
        </div>

        <div className="space-y-1.5 text-sm rounded-lg bg-slate-50 border border-slate-200 px-4 py-3 h-fit">
          <div className="flex justify-between text-slate-600">
            <span>Creditable value</span>
            <span className="font-semibold text-slate-900">
              {formatCurrency(preview.taxableAmount)}
            </span>
          </div>
          <div className="flex justify-between text-slate-600">
            <span>{isInterState ? 'IGST' : 'CGST + SGST'}</span>
            <span className="font-semibold text-slate-900">
              {formatCurrency(preview.taxAmount)}
            </span>
          </div>
          <div className="flex justify-between items-baseline pt-2 border-t border-slate-200">
            <span className="font-semibold text-slate-900">Total credit</span>
            <span className="text-lg font-bold text-slate-900">
              {formatCurrency(preview.grandTotal)}
            </span>
          </div>
          <p className="text-[11px] text-slate-400 pt-1">
            {preview.totalItems} unit(s) across {preview.lines.length} line(s). Stock is
            restocked and the invoice balance reduced when issued.
          </p>
        </div>
      </div>

      <div className="mt-6 flex justify-end gap-3 border-t border-slate-100 pt-4">
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="primary"
          onClick={handleSubmit}
          disabled={preview.lines.length === 0}
          loading={submitting}
        >
          Issue Credit Note
        </Button>
      </div>
    </Modal>
  );
}
