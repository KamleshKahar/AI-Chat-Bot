'use client';

import React from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowRight, Package } from 'lucide-react';
import { StatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';

export function LowStockAlert({ products = [] }) {
  const alertProducts = products.filter(
    (p) => p.status === 'low_stock' || p.status === 'out_of_stock'
  ).slice(0, 5);

  return (
    <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-2xs">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-amber-100 text-amber-700 rounded-lg">
            <AlertTriangle className="w-4 h-4" />
          </div>
          <h3 className="text-base font-semibold text-slate-900">Inventory Alerts</h3>
        </div>

        <Link
          href="/inventory?filter=low_stock"
          className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
        >
          View All <ArrowRight className="w-3 h-3" />
        </Link>
      </div>

      {alertProducts.length === 0 ? (
        <div className="py-8 text-center text-xs text-slate-500 bg-slate-50 rounded-lg border border-dashed border-slate-200">
          All inventory items are sufficiently stocked.
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {alertProducts.map((prod) => (
            <div key={prod.id} className="py-3 flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-slate-800 truncate">{prod.name}</p>
                <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-500">
                  <span>SKU: {prod.sku}</span>
                  <span>&bull;</span>
                  <span>Stock: <strong className="text-slate-900">{prod.stockQuantity}</strong> / {prod.minStockLevel} {prod.unit}</span>
                </div>
              </div>

              <div className="shrink-0 flex items-center gap-2">
                <StatusBadge status={prod.status} />
                <Link href={`/inventory?adjust=${prod.id}`}>
                  <Button variant="outline" size="sm" className="text-[11px] px-2 py-1">
                    Restock
                  </Button>
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
