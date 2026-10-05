'use client';

import React, { useState, useEffect } from 'react';
import {
  Building2,
  Mail,
  Phone,
  MapPin,
  ShoppingBag,
  Wallet,
  CalendarDays,
  FileText,
  BadgeCheck,
  Pencil,
  Trash2,
  ArrowLeft,
  Receipt,
} from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/Badge';
import { formatCurrency, formatDate } from '@/lib/formatters';

/**
 * Customer detail.
 *
 * Previously received the whole `sales` and `invoices` arrays and filtered them
 * for this customer. Those collections are server-paginated now, so this
 * component renders the `purchases` returned by `GET /api/customers/:id` and
 * does no client-side aggregation.
 */
export function CustomerDetailModal({ customer, purchases = [], onClose, onEdit, onDelete }) {
  if (!customer) return null;

  const lifetimeValue = purchases.reduce((acc, p) => acc + Number(p.grandTotal || 0), 0);
  const paidTotal = purchases.reduce((acc, p) => acc + Number(p.paidAmount || 0), 0);
  const avgOrderValue = purchases.length ? lifetimeValue / purchases.length : 0;

  const infoRows = [
    { icon: Building2, label: 'Company', value: customer.company },
    { icon: Mail, label: 'Email', value: customer.email },
    { icon: Phone, label: 'Phone', value: customer.phone },
    {
      icon: MapPin,
      label: 'Address',
      value: `${customer.address || ''}${customer.city ? `, ${customer.city}` : ''}${
        customer.state ? `, ${customer.state}` : ''
      }${customer.pincode ? ` - ${customer.pincode}` : ''}`,
    },
    { icon: BadgeCheck, label: 'GSTIN', value: customer.gstin || 'Not provided' },
    { icon: CalendarDays, label: 'Customer Since', value: formatDate(customer.joinedDate) },
  ];

  return (
    <Modal
      isOpen={!!customer}
      onClose={onClose}
      title={customer.name}
      description={customer.company}
      size="xl"
    >
      {/* Header Summary */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 pb-5 border-b border-slate-100">
        <div className="w-14 h-14 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold text-xl shrink-0">
          {customer.name
            .split(' ')
            .map((n) => n[0])
            .slice(0, 2)
            .join('')}
        </div>

        <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Lifetime Value
            </p>
            <p className="text-sm font-bold text-slate-900 mt-0.5">{formatCurrency(lifetimeValue)}</p>
          </div>
          <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Total Paid
            </p>
            <p className="text-sm font-bold text-emerald-600 mt-0.5">{formatCurrency(paidTotal)}</p>
          </div>
          <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Orders</p>
            <p className="text-sm font-bold text-slate-900 mt-0.5">{purchases.length}</p>
          </div>
          <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Avg Order Value
            </p>
            <p className="text-sm font-bold text-slate-900 mt-0.5">{formatCurrency(avgOrderValue)}</p>
          </div>
        </div>
      </div>

      {/* Outstanding */}
      <div className="mt-4 flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <Wallet className="h-5 w-5 text-amber-600" />
          <div>
            <p className="text-xs font-semibold text-amber-800">Outstanding Balance</p>
            <p className="text-[11px] text-amber-700">
              {customer.outstandingBalance > 0
                ? 'Payment pending against one or more invoices'
                : 'All invoices are fully settled'}
            </p>
          </div>
        </div>
        <span className="text-lg font-bold text-amber-700">
          {formatCurrency(customer.outstandingBalance)}
        </span>
      </div>

      {/* Contact Info */}
      <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
        {infoRows.map((row) => (
          <div key={row.label} className="flex items-start gap-2.5">
            <row.icon className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                {row.label}
              </p>
              <p className="text-sm text-slate-800 break-words">{row.value || 'Not provided'}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Purchase History */}
      <div className="mt-6">
        <h4 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
          <Receipt className="h-4 w-4 text-slate-400" />
          Purchase History
        </h4>

        {purchases.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-xs text-slate-500">
            No purchase history available for this customer.
          </p>
        ) : (
          <div className="rounded-lg border border-slate-200 overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-3 py-2.5">Invoice</th>
                  <th className="px-3 py-2.5">Date</th>
                  <th className="px-3 py-2.5">Items</th>
                  <th className="px-3 py-2.5">Payment</th>
                  <th className="px-3 py-2.5 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {purchases.map((purchase) => (
                  <tr key={purchase.invoiceNumber} className="hover:bg-slate-50/60">
                    <td className="px-3 py-2.5 font-mono text-slate-700">
                      {purchase.invoiceNumber}
                    </td>
                    <td className="px-3 py-2.5 text-slate-600">{formatDate(purchase.date)}</td>
                    <td className="px-3 py-2.5 text-slate-600">
                      {purchase.itemCount} item{purchase.itemCount === 1 ? '' : 's'}
                    </td>
                    <td className="px-3 py-2.5">
                      <StatusBadge status={purchase.paymentStatus} />
                    </td>
                    <td className="px-3 py-2.5 text-right font-bold text-slate-900">
                      {formatCurrency(purchase.grandTotal)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row sm:justify-between gap-3 mt-6 border-t border-slate-100 pt-4">
        <Button variant="softDanger" icon={Trash2} onClick={onDelete}>
          Delete Customer
        </Button>

        <div className="flex gap-2">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button variant="primary" icon={Pencil} onClick={onEdit}>
            Edit Details
          </Button>
        </div>
      </div>
    </Modal>
  );
}