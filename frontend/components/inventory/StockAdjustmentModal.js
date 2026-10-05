'use client';

import React, { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { useToast } from '@/context/ToastContext';
import { formatCurrency } from '@/lib/formatters';

const REASONS = [
  'Goods received from supplier (Purchase Order)',
  'Stock audit correction',
  'Damaged / breakage write-off',
  'Returned by customer',
  'Internal consumption',
  'Manual correction',
];

export function StockAdjustmentModal({ isOpen, onClose, product, onAdjust }) {
  const { success, error } = useToast();
  const [mode, setMode] = useState('add');
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState(REASONS[0]);
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  if (!product) return null;

  const delta = mode === 'add' ? Number(quantity || 0) : -Number(quantity || 0);
  const newStock = Math.max(0, Number(product.stockQuantity) + delta);
  const stockValue = Math.abs(delta) * Number(product.sellingPrice || 0);

  const handleSubmit = async () => {
    const nextErrors = {};
    if (!quantity || Number(quantity) <= 0) {
      nextErrors.quantity = 'Enter a quantity greater than 0';
    }
    if (mode === 'remove' && Number(quantity) > product.stockQuantity) {
      nextErrors.quantity = `Cannot remove more than ${product.stockQuantity} ${product.unit} in stock`;
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitting(true);
    try {
      await onAdjust(product.id, delta, reason, notes.trim() || undefined);

      success(
        `Stock ${mode === 'add' ? 'increased' : 'decreased'} by ${Math.abs(delta)} ${
          product.unit
        } for ${product.name}`
      );
      setQuantity('');
      setNotes('');
      setMode('add');
      onClose();
    } catch (err) {
      /*
       * A 409 means the server refused because stock moved underneath us (another
       * session sold the last units). Show the server's message rather than
       * claiming success — the optimistic local guard above cannot see other
       * sessions.
       */
      error(err.message || 'Could not apply the stock adjustment.');
      if (err.details?.quantity) {
        setErrors({ quantity: err.details.quantity });
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Adjust Stock"
      description={product.name}
      size="md"
    >
      {/* Current stock summary */}
      <div className="flex items-center justify-between rounded-lg bg-slate-50 border border-slate-200 px-4 py-3 mb-5">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Current Stock
          </p>
          <p className="text-sm font-mono text-slate-700 mt-0.5">{product.sku}</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-slate-900">
            {product.stockQuantity}
            <span className="text-sm font-medium text-slate-500 ml-1">{product.unit}</span>
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {/* Mode toggle */}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setMode('add')}
            className={`rounded-lg border px-3 py-2.5 text-sm font-semibold transition ${
              mode === 'add'
                ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            + Stock In
          </button>
          <button
            type="button"
            onClick={() => setMode('remove')}
            className={`rounded-lg border px-3 py-2.5 text-sm font-semibold transition ${
              mode === 'remove'
                ? 'border-rose-500 bg-rose-50 text-rose-700'
                : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            − Stock Out
          </button>
        </div>

        <Input
          label={`Quantity to ${mode === 'add' ? 'add' : 'remove'}`}
          type="number"
          min="1"
          required
          value={quantity}
          error={errors.quantity}
          onChange={(e) => {
            setQuantity(e.target.value);
            setErrors((p) => ({ ...p, quantity: '' }));
          }}
          placeholder="0"
        />

        <Select
          label="Adjustment Reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          options={REASONS.map((r) => ({ value: r, label: r }))}
          placeholder=""
        />

        <div>
          <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
            Notes (optional)
          </label>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Reference invoice, supplier name, remarks..."
            className="w-full rounded-lg border border-slate-300 text-sm text-slate-900 placeholder-slate-400 transition-colors hover:border-slate-400 focus:outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-500/20 px-3 py-2"
          />
        </div>

        {/* Preview */}
        {quantity && Number(quantity) > 0 && (
          <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-indigo-900">New stock level</span>
              <span className="font-bold text-indigo-900">
                {product.stockQuantity} → {newStock} {product.unit}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm mt-1">
              <span className="text-indigo-700">Stock movement value</span>
              <span className="font-semibold text-indigo-700">{formatCurrency(stockValue)}</span>
            </div>
            {newStock <= product.minStockLevel && newStock > 0 && (
              <p className="text-xs text-amber-700 mt-2 font-medium">
                Warning: this will trigger a low-stock alert.
              </p>
            )}
            {newStock === 0 && (
              <p className="text-xs text-rose-700 mt-2 font-medium">
                Warning: this item will be marked as out of stock.
              </p>
            )}
          </div>
        )}
      </div>

      <div className="mt-6 flex justify-end gap-3 border-t border-slate-100 pt-4">
        <Button variant="outline" onClick={onClose} disabled={submitting}>
          Cancel
        </Button>
        <Button variant="primary" onClick={handleSubmit} disabled={submitting} loading={submitting}>
          Apply Adjustment
        </Button>
      </div>
    </Modal>
  );
}