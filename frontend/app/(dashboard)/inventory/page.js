'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  PackagePlus,
  Package,
  Boxes,
  AlertTriangle,
  Eye,
  Pencil,
  Trash2,
  SlidersHorizontal,
} from 'lucide-react';
import { useData } from '@/context/DataContext';
import { useToast } from '@/context/ToastContext';
import { useServerList, useServerResource, useDebouncedValue } from '@/hooks/useServerQuery';
import { formatCurrency, formatNumber } from '@/lib/formatters';
import { Button } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, StatCard } from '@/components/ui/Card';
import { DataTable } from '@/components/ui/DataTable';
import { SearchInput, FilterChip } from '@/components/ui/SearchInput';
import { EmptyState } from '@/components/ui/StateFeedback';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { StatusBadge } from '@/components/ui/Badge';
import { ProductFormModal } from '@/components/inventory/ProductFormModal';
import { ProductDetailModal } from '@/components/inventory/ProductDetailModal';
import { StockAdjustmentModal } from '@/components/inventory/StockAdjustmentModal';

const PER_PAGE = 10;

export default function InventoryPage() {
  const { categories, addProduct, updateProduct, deleteProduct, adjustStock, revision } =
    useData();
  const { success, error: errorToast } = useToast();
  const searchParams = useSearchParams();

  // --- Query state ---------------------------------------------------------
  // These are *server* parameters now: the browser sends them and renders
  // whatever comes back, rather than filtering a full in-memory array.
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [stockFilter, setStockFilter] = useState('all');
  const [sortBy, setSortBy] = useState('name');
  const [page, setPage] = useState(1);
  const [submitting, setSubmitting] = useState(false);

  // Debounce so a fast typist issues one request, not one per keystroke.
  const debouncedSearch = useDebouncedValue(search, 300);

  const query = useMemo(
    () => ({
      search: debouncedSearch.trim() || undefined,
      category: categoryFilter === 'all' ? undefined : categoryFilter,
      status: stockFilter === 'all' ? undefined : stockFilter,
      sort: sortBy,
      page,
      limit: PER_PAGE,
    }),
    [debouncedSearch, categoryFilter, stockFilter, sortBy, page]
  );

  const { rows: products, meta, counts, isLoading } = useServerList({
    path: '/products',
    query,
    refreshKey: revision,
  });

  // Totals for the stat cards. `counts` comes from the same SQL status
  // expression as the filter, so a chip's number always equals what it returns.
  const summary = useServerResource({ path: '/dashboard/summary', refreshKey: revision });
  const metrics = summary.data?.metrics ?? null;

  const [formOpen, setFormOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [viewingId, setViewingId] = useState(null);
  const [adjustingId, setAdjustingId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  /*
   * Deep links: ?action=add, ?adjust=PRD-101, ?filter=low_stock
   *
   * The target is fetched by id rather than looked up in `products`. With
   * server-side pagination the row may well not be on the current page, and a
   * `products.find(...)` would silently fail to open the modal.
   */
  const handledQuery = useRef(null);
  const rawQuery = searchParams.toString();

  useEffect(() => {
    if (handledQuery.current === rawQuery) return;
    handledQuery.current = rawQuery;

    const action = searchParams.get('action');
    const adjustId = searchParams.get('adjust');
    const filter = searchParams.get('filter');

    if (filter === 'low_stock') {
      setStockFilter('low_stock');
      setPage(1);
    }
    if (action === 'add') {
      setEditingProduct(null);
      setFormOpen(true);
    }
    if (adjustId) setAdjustingId(adjustId);
  }, [rawQuery, searchParams]);

  // A new filter or search always invalidates the current page number.
  //
  // Two shapes, deliberately. `resetPageAndSet` is a plain `onChange` handler —
  // SearchInput and Select pass the new value in. `pickFilter` *builds* an
  // onClick handler. Writing `onClick={resetPageAndSet(setStockFilter)('low_stock')}`
  // instead would call the returned function during render, making its
  // `setPage(1)` a render-phase update: React throws "Too many re-renders" and
  // the page never paints.
  const resetPageAndSet = (setter) => (value) => {
    setPage(1);
    setter(value);
  };

  const pickFilter = (setter) => (value) => () => {
    setPage(1);
    setter(value);
  };

  const clearFilters = () => {
    setSearch('');
    setCategoryFilter('all');
    setStockFilter('all');
    setPage(1);
  };

  // The stock-adjustment modal needs live stock to validate against; the row in
  // hand can be stale if someone else sold units in another session.
  const { data: adjustingProduct } = useServerResource({
    path: adjustingId ? `/products/${encodeURIComponent(adjustingId)}` : null,
    enabled: Boolean(adjustingId),
    refreshKey: revision,
  });

  const { data: productDetail } = useServerResource({
    path: viewingId ? `/products/${encodeURIComponent(viewingId)}` : null,
    enabled: Boolean(viewingId),
    refreshKey: revision,
  });

  const handleSave = async (data) => {
    setSubmitting(true);
    try {
      if (editingProduct) {
        await updateProduct(editingProduct.id, data);
        success(`Product "${data.name}" updated`);
      } else {
        await addProduct(data);
        success(`Product "${data.name}" added to inventory`);
      }
      setFormOpen(false);
      setEditingProduct(null);
      setViewingId(null);
    } catch (err) {
      errorToast(err.message || 'Could not save the product.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const name = deleteTarget.name;
    try {
      await deleteProduct(deleteTarget.id);
      success(`Product "${name}" deleted`);
      if (viewingId === deleteTarget.id) setViewingId(null);
    } catch (err) {
      errorToast(err.message || 'Could not delete the product.');
    } finally {
      setDeleteTarget(null);
    }
  };

  const columns = [
    {
      key: 'name',
      header: 'Product',
      accessor: 'name',
      render: (row) => (
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-indigo-50 text-indigo-600 border border-indigo-100 flex items-center justify-center shrink-0">
            <Package className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-slate-900 truncate">{row.name}</p>
            <p className="text-xs text-slate-500 font-mono">{row.sku}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'category',
      header: 'Category',
      accessor: 'category',
      render: (row) => <span className="text-sm text-slate-600">{row.category}</span>,
    },
    {
      key: 'mrp',
      header: 'MRP',
      accessor: 'mrp',
      render: (row) => <span className="text-sm text-slate-500">{formatCurrency(row.mrp)}</span>,
    },
    {
      key: 'sellingPrice',
      header: 'Selling Price',
      accessor: 'sellingPrice',
      render: (row) => (
        <span className="font-semibold text-slate-900">{formatCurrency(row.sellingPrice)}</span>
      ),
    },
    {
      key: 'stockQuantity',
      header: 'Stock',
      accessor: 'stockQuantity',
      render: (row) => (
        <div>
          <p className="font-semibold text-slate-900">
            {row.stockQuantity} <span className="text-xs font-normal text-slate-500">{row.unit}</span>
          </p>
          <p className="text-[11px] text-slate-400">Reorder at {row.minStockLevel}</p>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <StatusBadge status={row.status} />,
    },
    {
      key: 'actions',
      header: '',
      headerClass: 'text-right',
      cellClass: 'text-right',
      sortable: false,
      render: (row) => (
        <div className="flex items-center justify-end gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setViewingId(row.id);
            }}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-indigo-600 transition"
            title="View product"
          >
            <Eye className="w-4 h-4" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setAdjustingId(row.id);
            }}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-emerald-600 transition"
            title="Adjust stock"
          >
            <SlidersHorizontal className="w-4 h-4" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setEditingProduct(row);
              setFormOpen(true);
            }}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-indigo-600 transition"
            title="Edit product"
          >
            <Pencil className="w-4 h-4" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setDeleteTarget(row);
            }}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition"
            title="Delete product"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ),
    },
  ];

  const totalStockUnits = products.reduce((acc, p) => acc + Number(p.stockQuantity || 0), 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inventory"
        description="Track products, stock levels, pricing and warehouse value across your catalogue."
        breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Inventory' }]}
        actions={
          <>
            <Button
              variant="outline"
              icon={SlidersHorizontal}
              onClick={pickFilter(setStockFilter)(
                stockFilter === 'low_stock' ? 'all' : 'low_stock'
              )}
            >
              {formatNumber(counts?.low_stock ?? metrics?.lowStockCount ?? 0)} Low Stock
            </Button>
            <Button
              variant="primary"
              icon={PackagePlus}
              onClick={() => {
                setEditingProduct(null);
                setFormOpen(true);
              }}
            >
              Add Product
            </Button>
          </>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          label="Total Products"
          value={formatNumber(meta.total ?? products.length)}
          hint={`${categories.length} categories`}
          icon={Package}
          tone="indigo"
        />
        {/*
          Stock units on *this page*, labelled honestly. The server does not
          expose a global stock-unit total; this is a page subtotal, not a
          grand total, and claiming otherwise would be a lie in a stat card.
        */}
        <StatCard
          label="Stock Units (this page)"
          value={formatNumber(totalStockUnits)}
          hint={meta.total > products.length ? `First ${products.length} of ${meta.total}` : undefined}
          icon={Boxes}
          tone="sky"
        />
        <StatCard
          label="Low Stock Alerts"
          value={formatNumber(counts?.low_stock ?? metrics?.lowStockCount ?? 0)}
          hint="At or below reorder level"
          icon={AlertTriangle}
          tone="amber"
        />
        <StatCard
          label="Inventory Value (Cost)"
          value={formatCurrency(metrics?.totalInventoryValue ?? 0)}
          hint={`${formatNumber(counts?.out_of_stock ?? metrics?.outOfStockCount ?? 0)} items out of stock`}
          icon={Package}
          tone="emerald"
        />
      </div>

      {/* Toolbar */}
      <Card padded={false} bodyClassName="p-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <SearchInput
            value={search}
            onChange={resetPageAndSet(setSearch)}
            placeholder="Search by product name, SKU or category..."
          />

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={categoryFilter}
              onChange={(e) => resetPageAndSet(setCategoryFilter)(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 focus:outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-500/20 cursor-pointer"
            >
              <option value="all">All categories</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.name}>
                  {cat.name}
                </option>
              ))}
            </select>

            <FilterChip
              active={stockFilter === 'all'}
              onClick={pickFilter(setStockFilter)('all')}
              count={counts?.all}
            >
              All
            </FilterChip>
            <FilterChip
              active={stockFilter === 'in_stock'}
              onClick={pickFilter(setStockFilter)('in_stock')}
              count={counts?.in_stock}
            >
              In stock
            </FilterChip>
            <FilterChip
              active={stockFilter === 'low_stock'}
              onClick={pickFilter(setStockFilter)('low_stock')}
              count={counts?.low_stock}
            >
              Low stock
            </FilterChip>
            <FilterChip
              active={stockFilter === 'out_of_stock'}
              onClick={pickFilter(setStockFilter)('out_of_stock')}
              count={counts?.out_of_stock}
            >
              Out of stock
            </FilterChip>
          </div>
        </div>
      </Card>

      {/* Table */}
      <DataTable
        columns={columns}
        data={products}
        loading={isLoading}
        onRowClick={(row) => setViewingId(row.id)}
        page={page}
        perPage={PER_PAGE}
        total={meta.total}
        onPageChange={setPage}
        sortKey={sortBy === 'name' ? 'name' : sortBy}
        sortOrder="asc"
        onSortChange={(key) => setSortBy(key)}
        emptyState={
          <EmptyState
            icon={Package}
            title="No products found"
            description="No products match your current search or filter criteria."
            actionLabel="Clear filters"
            onAction={clearFilters}
          />
        }
      />

      {/* Modals */}
      <ProductFormModal
        isOpen={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditingProduct(null);
        }}
        onSubmit={handleSave}
        initialData={editingProduct}
        categories={categories}
      />

      {productDetail?.product && (
        <ProductDetailModal
          product={productDetail.product}
          performance={productDetail.performance}
          salesHistory={productDetail.salesHistory ?? []}
          movements={productDetail.movements ?? []}
          onClose={() => setViewingId(null)}
          onEdit={() => {
            setEditingProduct(productDetail.product);
            setViewingId(null);
            setFormOpen(true);
          }}
          onAdjust={() => {
            setAdjustingId(productDetail.product.id);
            setViewingId(null);
          }}
          onDelete={() => setDeleteTarget(productDetail.product)}
        />
      )}

      <StockAdjustmentModal
        isOpen={!!adjustingProduct}
        onClose={() => setAdjustingId(null)}
        product={adjustingProduct?.product ?? null}
        onAdjust={adjustStock}
      />

      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete product?"
        message={`"${deleteTarget?.name}" (${deleteTarget?.sku}) will be permanently removed from your inventory catalogue.`}
        confirmText="Delete Product"
      />
    </div>
  );
}