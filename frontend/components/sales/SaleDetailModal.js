'use client';

import React from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/Badge';
import { formatCurrency, formatDate } from '@/lib/formatters';

/**
 * Sale detail.
 *
 * Takes a single `sale` object from `GET /api/sales/:id`. The `invoice` prop is
 * gone: sales and invoices are two projections of the same row, so the sale
 * payload already carries the invoice number and totals this modal shows.
 */
export function SaleDetailModal({ sale, onClose, onViewInvoice }) {
  if (!sale) return null;

  return (
    <Modal
      isOpen={!!sale}
      onClose={onClose}
      title={`Sale ${sale.invoiceNumber}`}
      description={`${formatDate(sale.date)} • ${sale.customerName}`}
      size="xl"
    >
      {/* Header summary */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-100">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold text-sm shrink-0">
            {sale.customerName
              .split(' ')
              .map((n) => n[0])
              .slice(0, 2)
              .join('')}
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900">{sale.customerName}</p>
            <p className="text-xs text-slate-500">{sale.customerCompany || 'Walk-in Customer'}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge status={sale.paymentStatus} size="lg" />
          <div className="text-right">
            <p className="text-[11px] text-slate-500 uppercase tracking-wider font-semibold">
              Grand Total
            </p>
            <p className="text-xl font-bold text-slate-900">{formatCurrency(sale.grandTotal)}</p>
          </div>
        </div>
      </div>

      {/* Meta */}
      <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Sale ID</p>
          <p className="text-sm font-mono font-medium text-slate-800 mt-0.5">{sale.id}</p>
        </div>
        <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            Invoice No
          </p>
          <p className="text-sm font-mono font-medium text-slate-800 mt-0.5">
            {sale.invoiceNumber}
          </p>
        </div>
        <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            Payment Method
          </p>
          <p className="text-sm font-medium text-slate-800 mt-0.5">{sale.paymentMethod}</p>
        </div>
        <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Amount Paid</p>
          <p className="text-sm font-bold text-emerald-600 mt-0.5">
            {formatCurrency(sale.paidAmount)}
          </p>
        </div>
      </div>

      {/* Line items */}
      <div className="mt-5">
        <h4 className="text-sm font-semibold text-slate-900 mb-3">Items Sold</h4>
        <div className="rounded-lg border border-slate-200 overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-3 py-2.5">Product</th>
                <th className="px-3 py-2.5 text-center">Qty</th>
                <th className="px-3 py-2.5 text-right">Unit Price</th>
                <th className="px-3 py-2.5 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sale.items.map((item) => (
                <tr key={item.productId} className="hover:bg-slate-50/60">
                  <td className="px-3 py-2.5">
                    <p className="font-semibold text-slate-800">{item.productName}</p>
                    <p className="text-[11px] text-slate-400 font-mono">{item.sku}</p>
                  </td>
                  <td className="px-3 py-2.5 text-center font-semibold text-slate-800">
                    {item.quantity}
                  </td>
                  <td className="px-3 py-2.5 text-right text-slate-600">
                    {formatCurrency(item.unitPrice)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-bold text-slate-900">
                    {formatCurrency(item.subtotal)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Totals */}
      <div className="mt-4 flex justify-end">
        <div className="w-full sm:w-80 space-y-2 text-sm">
          <div className="flex justify-between text-slate-600">
            <span>Subtotal</span>
            <span className="font-semibold text-slate-900">{formatCurrency(sale.subtotal)}</span>
          </div>
          {Number(sale.discountAmount) > 0 && (
            <div className="flex justify-between text-emerald-600">
              <span>
                Discount {sale.discountPercent > 0 ? `(${sale.discountPercent}%)` : ''}
              </span>
              <span className="font-semibold">− {formatCurrency(sale.discountAmount)}</span>
            </div>
          )}
          <div className="flex justify-between text-slate-600">
            <span>GST ({sale.taxRate}%)</span>
            <span className="font-semibold text-slate-900">{formatCurrency(sale.taxAmount)}</span>
          </div>
          <div className="flex justify-between items-baseline pt-2 border-t border-slate-200">
            <span className="font-semibold text-slate-900">Grand Total</span>
            <span className="text-lg font-bold text-slate-900">
              {formatCurrency(sale.grandTotal)}
            </span>
          </div>
          <div className="flex justify-between text-amber-600">
            <span>Balance Due</span>
            <span className="font-semibold">
              {formatCurrency(Math.max(0, Number(sale.grandTotal) - Number(sale.paidAmount)))}
            </span>
          </div>
        </div>
      </div>

      {/* Notes */}
      {sale.notes && (
        <div className="mt-5 rounded-lg bg-slate-50 border border-slate-200 px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
            Notes
          </p>
          <p className="text-xs text-slate-700">{sale.notes}</p>
        </div>
      )}

      <div className="flex justify-end gap-2 mt-6 border-t border-slate-100 pt-4">
        <Button variant="outline" onClick={onClose}>
          Close
        </Button>
        {invoice && (
          <Button variant="primary" onClick={onViewInvoice}>
            View Invoice
          </Button>
        )}
      </div>
    </Modal>
  );
}