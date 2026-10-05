'use client';

import React from 'react';
import {
  X,
  Package,
  Barcode,
  Boxes,
  IndianRupee,
  Tag,
  Truck,
  TrendingUp,
  ShoppingCart,
} from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { StatusBadge, Badge } from '@/components/ui/Badge';
import { formatCurrency, formatDate, formatNumber } from '@/lib/formatters';

/**
 * Product detail.
 *
 * `sales` used to be the entire sales array, scanned in the browser for lines
 * matching this product. That is impossible now — sales are paginated server-side
 * — so `GET /api/products/:id` returns the product's own aggregated `performance`
 * plus its `salesHistory` rows. This component renders those directly and does
 * no aggregation of its own.
 */
export function ProductDetailModal({
  product,
  performance,
  salesHistory = [],
  movements = [],
  onClose,
  onEdit,
  onAdjust,
  onDelete,
}) {
  if (!product) return null;

  const totalUnitsSold = performance?.unitsSold ?? 0;
  const totalRevenue = performance?.revenue ?? 0;
  const margin =
    Number(product.sellingPrice) > 0
      ? Math.round(
          ((Number(product.sellingPrice) - Number(product.costPrice)) /
            Number(product.sellingPrice)) *
            100
        )
      : 0;
  // Stock-cover days are computed server-side from the actual run rate over the
  // window, which is more accurate than the old `stock / units * 30` guess.
  const stockCoverDays = performance?.stockCoverDays ?? null;

  const specs = [
    { icon: Barcode, label: 'SKU Code', value: product.sku },
    { icon: Tag, label: 'Category', value: product.category },
    { icon: Truck, label: 'Unit', value: product.unit },
    { icon: Boxes, label: 'GST Rate', value: `${product.taxRate}%` },
  ];

  return (
    <Modal
      isOpen={!!product}
      onClose={onClose}
      title={product.name}
      description={`${product.sku} • ${product.category}`}
      size="xl"
    >
      {/* Summary */}
      <div className="flex flex-col sm:flex-row gap-4 pb-5 border-b border-slate-100">
        <div className="w-14 h-14 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0">
          <Package className="w-7 h-7" />
        </div>

        <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Stock on Hand
            </p>
            <p className="text-base font-bold text-slate-900 mt-0.5">
              {product.stockQuantity} <span className="text-xs text-slate-500">{product.unit}</span>
            </p>
          </div>
          <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Selling Price
            </p>
            <p className="text-base font-bold text-slate-900 mt-0.5">
              {formatCurrency(product.sellingPrice)}
            </p>
          </div>
          <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Units Sold
            </p>
            <p className="text-base font-bold text-slate-900 mt-0.5">{formatNumber(totalUnitsSold)}</p>
          </div>
          <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Sales Revenue
            </p>
            <p className="text-base font-bold text-emerald-600 mt-0.5">
              {formatCurrency(totalRevenue)}
            </p>
          </div>
        </div>
      </div>

      {/* Status + Pricing */}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <StatusBadge status={product.status} size="lg" />
        <Badge variant="neutral" size="lg">
          Reorder at {product.minStockLevel} {product.unit}
        </Badge>
        {stockCoverDays !== null && stockCoverDays > 0 && (
          <Badge variant={stockCoverDays < 15 ? 'warning' : 'info'} size="lg">
            ~{stockCoverDays} days stock cover
          </Badge>
        )}
      </div>

      {/* Description */}
      {product.description && (
        <p className="mt-4 text-sm text-slate-600 leading-relaxed rounded-lg bg-slate-50 border border-slate-200 px-4 py-3">
          {product.description}
        </p>
      )}

      {/* Pricing breakdown */}
      <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-lg border border-slate-200 px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">MRP</p>
          <p className="text-lg font-bold text-slate-900 mt-0.5">{formatCurrency(product.mrp)}</p>
        </div>
        <div className="rounded-lg border border-slate-200 px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Cost Price
          </p>
          <p className="text-lg font-bold text-slate-900 mt-0.5">{formatCurrency(product.costPrice)}</p>
        </div>
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700">
            Margin ({margin}%)
          </p>
          <p className="text-lg font-bold text-emerald-700 mt-0.5">
            {formatCurrency(Number(product.sellingPrice) - Number(product.costPrice))}
          </p>
        </div>
      </div>

      {/* Specs */}
      <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-4">
        {specs.map((spec) => (
          <div key={spec.label} className="flex items-start gap-2">
            <spec.icon className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                {spec.label}
              </p>
              <p className="text-sm text-slate-800 break-words">{spec.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Sales history */}
      <div className="mt-6">
        <h4 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
          <ShoppingCart className="h-4 w-4 text-slate-400" />
          Sales History
        </h4>

        {salesHistory.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-xs text-slate-500">
            This product has not been sold yet.
          </p>
        ) : (
          <div className="rounded-lg border border-slate-200 overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-3 py-2.5">Invoice</th>
                  <th className="px-3 py-2.5">Date</th>
                  <th className="px-3 py-2.5">Customer</th>
                  <th className="px-3 py-2.5 text-right">Qty</th>
                  <th className="px-3 py-2.5 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {salesHistory.map((row) => (
                  <tr
                    key={`${row.invoiceNumber}-${row.date}-${row.quantity}`}
                    className="hover:bg-slate-50/60"
                  >
                    <td className="px-3 py-2.5 font-mono text-slate-700">{row.invoiceNumber}</td>
                    <td className="px-3 py-2.5 text-slate-600">{formatDate(row.date)}</td>
                    <td className="px-3 py-2.5 text-slate-600">{row.customerName || '—'}</td>
                    <td className="px-3 py-2.5 text-right font-semibold text-slate-800">
                      {row.quantity}
                    </td>
                    <td className="px-3 py-2.5 text-right font-bold text-slate-900">
                      {formatCurrency(row.lineTotal)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Stock movements — every change is recorded server-side. */}
      {movements.length > 0 && (
        <div className="mt-6">
          <h4 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
            <Boxes className="h-4 w-4 text-slate-400" />
            Recent Stock Movements
          </h4>

          <div className="rounded-lg border border-slate-200 overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-3 py-2.5">When</th>
                  <th className="px-3 py-2.5">Type</th>
                  <th className="px-3 py-2.5">Reason</th>
                  <th className="px-3 py-2.5 text-right">Change</th>
                  <th className="px-3 py-2.5 text-right">Stock After</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {movements.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-50/60">
                    <td className="px-3 py-2.5 text-slate-600">
                      {formatDate(String(m.createdAt ?? '').slice(0, 10))}
                    </td>
                    <td className="px-3 py-2.5 text-slate-700">{m.type}</td>
                    <td className="px-3 py-2.5 text-slate-600">{m.reason || '—'}</td>
                    <td
                      className={`px-3 py-2.5 text-right font-semibold ${
                        Number(m.quantityDelta) >= 0 ? 'text-emerald-600' : 'text-rose-600'
                      }`}
                    >
                      {Number(m.quantityDelta) >= 0 ? '+' : ''}
                      {m.quantityDelta}
                    </td>
                    <td className="px-3 py-2.5 text-right font-bold text-slate-900">
                      {m.stockAfter}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-col sm:flex-row sm:justify-between gap-3 mt-6 border-t border-slate-100 pt-4">
        <Button variant="softDanger" onClick={onDelete}>
          Delete Product
        </Button>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button variant="secondary" onClick={onAdjust}>
            Adjust Stock
          </Button>
          <Button variant="primary" onClick={onEdit}>
            Edit Product
          </Button>
        </div>
      </div>
    </Modal>
  );
}