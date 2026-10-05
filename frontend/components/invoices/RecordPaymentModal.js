'use client';

import React, { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { useToast } from '@/context/ToastContext';
import { formatCurrency } from '@/lib/formatters';

export function RecordPaymentModal({ isOpen, onClose, invoice, onSubmit }) {
  const { success, error } = useToast();
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('UPI');
  const [reference, setReference] = useState('');
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  // Every hook must run before this guard. Returning early above a later
  // `useState` shortens the hook list on the first render (when the parent has no
  // invoice yet) and lengthens it the moment the user clicks "Pay" — React
  // throws "Rendered more hooks than during the previous render" and the modal
  // never opens.
  if (!invoice) return null;

  const balanceDue = Number(invoice.balanceDue || 0);

  /**
   * Record the payment.
   *
   * `onSubmit` is now genuinely async and can fail — the invoice row is locked
   * server-side and the payment rejected if it exceeds the balance due under
   * concurrent writes. The previous version called it synchronously inside a
   * `try`, so a rejected `Promise` was not caught by the `catch` (a rejected
   * promise is not a thrown error at that point), the success toast fired
   * regardless, and the modal closed. The user was told a payment was recorded
   * when it was not.
   */
  const handleSubmit = async () => {
    const nextErrors = {};
    const value = Number(amount);

    if (!amount || value <= 0) {
      nextErrors.amount = 'Enter a payment amount greater than zero';
    } else if (value > balanceDue) {
      nextErrors.amount = `Payment cannot exceed the balance due of ${formatCurrency(balanceDue)}`;
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitting(true);
    try {
      const ok = await onSubmit(value, method, reference.trim() || undefined);

      // The parent returns false when it already surfaced the error; only close
      // on a confirmed success.
      if (ok === false) return;

      success(`${formatCurrency(value)} payment recorded against ${invoice.id}`);
      setAmount('');
      setReference('');
      onClose();
    } catch (err) {
      error(err.message || 'Failed to record payment');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Record Payment"
      description={`Invoice ${invoice.id}`}
      size="md"
    >
      {/* Balance summary */}
      <div className="rounded-lg bg-slate-50 border border-slate-200 px-4 py-3 mb-5">
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-600">Invoice Total</span>
          <span className="font-semibold text-slate-900">{formatCurrency(invoice.grandTotal)}</span>
        </div>
        <div className="flex items-center justify-between text-sm mt-1">
          <span className="text-slate-600">Already Paid</span>
          <span className="font-semibold text-emerald-600">{formatCurrency(invoice.paidAmount)}</span>
        </div>
        <div className="flex items-center justify-between text-sm mt-2 pt-2 border-t border-slate-200">
          <span className="font-semibold text-slate-900">Balance Due</span>
          <span className="text-lg font-bold text-amber-600">{formatCurrency(balanceDue)}</span>
        </div>
      </div>

      <div className="space-y-4">
        <Input
          label="Amount Received (₹)"
          type="number"
          min="0"
          step="0.01"
          required
          value={amount}
          error={errors.amount}
          onChange={(e) => {
            setAmount(e.target.value);
            setErrors((p) => ({ ...p, amount: '' }));
          }}
          placeholder="0.00"
        />

        {/* Quick amount buttons */}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setAmount(String(balanceDue))}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
          >
            Full balance
          </button>
          {[500, 1000, 5000, 10000]
            .filter((v) => v <= balanceDue)
            .map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setAmount(String(v))}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
              >
                {formatCurrency(v)}
              </button>
            ))}
        </div>

        <Select
          label="Payment Method"
          value={method}
          onChange={(e) => setMethod(e.target.value)}
          options={[
            { value: 'UPI', label: 'UPI' },
            { value: 'Cash', label: 'Cash' },
            { value: 'Bank Transfer', label: 'Bank Transfer / NEFT' },
            { value: 'Cheque', label: 'Cheque' },
            { value: 'Credit Card', label: 'Credit Card' },
          ]}
          placeholder=""
        />

        <Input
          label="Reference / Transaction ID (optional)"
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          placeholder="e.g. UTR 402188337201, Cheque 000452"
        />
      </div>

      <div className="mt-6 flex justify-end gap-3 border-t border-slate-100 pt-4">
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="primary"
          onClick={handleSubmit}
          disabled={balanceDue <= 0}
          loading={submitting}
        >
          Record Payment
        </Button>
      </div>
    </Modal>
  );
}