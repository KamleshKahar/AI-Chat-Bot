'use client';

import React, { useState, useEffect } from 'react';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { FormModal } from '@/components/ui/FormModal';
import { formatCurrency } from '@/lib/formatters';

const UNITS = ['pcs', 'box', 'pack', 'rolls', 'sets', 'kg', 'litre', 'metre'];
const TAX_RATES = [0, 5, 12, 18, 28];

const EMPTY_FORM = {
  name: '',
  sku: '',
  category: '',
  mrp: '',
  sellingPrice: '',
  costPrice: '',
  stockQuantity: '',
  minStockLevel: 10,
  unit: 'pcs',
  taxRate: 18,
  description: '',
};

export function ProductFormModal({ isOpen, onClose, onSubmit, initialData, categories = [] }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (isOpen) {
      setForm(initialData ? { ...EMPTY_FORM, ...initialData } : EMPTY_FORM);
      setErrors({});
    }
  }, [isOpen, initialData]);

  const isEditing = !!initialData;

  const handleChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: '' }));
  };

  // Auto-derive selling price from MRP when adding new (MRP-based retail margin)
  const handleMrpChange = (value) => {
    setForm((prev) => {
      const mrp = Number(value || 0);
      const autoSelling = mrp > 0 ? Math.round(mrp * 0.88) : prev.sellingPrice;
      return {
        ...prev,
        mrp: value,
        sellingPrice: isEditing ? prev.sellingPrice : autoSelling,
      };
    });
    setErrors((prev) => ({ ...prev, mrp: '' }));
  };

  const validate = () => {
    const nextErrors = {};

    if (!form.name.trim()) nextErrors.name = 'Product name is required';
    if (!form.sku.trim()) nextErrors.sku = 'SKU is required';
    if (!form.category) nextErrors.category = 'Please select a category';

    const mrp = Number(form.mrp);
    const selling = Number(form.sellingPrice);
    const cost = Number(form.costPrice);
    const stock = Number(form.stockQuantity);

    if (!form.mrp || mrp <= 0) nextErrors.mrp = 'MRP must be greater than 0';
    if (!form.sellingPrice || selling <= 0)
      nextErrors.sellingPrice = 'Selling price must be greater than 0';
    else if (selling > mrp)
      nextErrors.sellingPrice = 'Selling price cannot exceed MRP';

    if (!form.costPrice || cost <= 0) nextErrors.costPrice = 'Cost price must be greater than 0';
    else if (cost > selling)
      nextErrors.costPrice = 'Cost price cannot exceed selling price';

    if (isNaN(stock) || stock < 0) nextErrors.stockQuantity = 'Stock quantity cannot be negative';
    if (Number(form.minStockLevel) < 0)
      nextErrors.minStockLevel = 'Minimum stock level cannot be negative';

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;

    const payload = {
      ...form,
      name: form.name.trim(),
      sku: form.sku.trim().toUpperCase(),
      description: form.description.trim(),
    };

    if (isEditing) {
      /*
       * Stock is not editable here, and must not be sent.
       *
       * `updateProductSchema` omits `stockQuantity` on purpose: a direct write
       * would leave no movement row and no audit trail, so the API rejects it.
       * Previously the field was sent anyway, Zod stripped it as unknown, and
       * the save returned 200 while changing nothing at all — a silent no-op.
       * Stock moves only through the stock-adjustment endpoint, which writes a
       * movement row with the resulting level.
       */
      delete payload.stockQuantity;
    }

    await onSubmit(payload);
  };

  const margin =
    Number(form.sellingPrice) > 0 && Number(form.costPrice) > 0
      ? Math.round(
          ((Number(form.sellingPrice) - Number(form.costPrice)) / Number(form.sellingPrice)) * 100
        )
      : 0;

  return (
    <FormModal
      isOpen={isOpen}
      onClose={onClose}
      onSubmit={handleSubmit}
      title={isEditing ? 'Edit Product' : 'Add New Product'}
      description={
        isEditing
          ? 'Update pricing, stock levels and product information.'
          : 'Add an item to your inventory catalogue with pricing and stock details.'
      }
      submitLabel={isEditing ? 'Update Product' : 'Add Product'}
      size="lg"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <Input
            label="Product Name"
            required
            value={form.name}
            error={errors.name}
            onChange={(e) => handleChange('name', e.target.value)}
            placeholder="e.g. Wireless Barcode Scanner"
          />
        </div>

        <Input
          label="SKU Code"
          required
          value={form.sku}
          error={errors.sku}
          onChange={(e) => handleChange('sku', e.target.value)}
          placeholder="ELEC-BC-01"
          helperText="Unique stock keeping unit code"
        />
        <Select
          label="Category"
          required
          value={form.category}
          error={errors.category}
          onChange={(e) => handleChange('category', e.target.value)}
          options={categories.map((c) => ({ value: c.name, label: c.name }))}
          placeholder="Select category"
        />

        <Input
          label="MRP (₹)"
          type="number"
          min="0"
          step="0.01"
          required
          value={form.mrp}
          error={errors.mrp}
          onChange={(e) => handleMrpChange(e.target.value)}
          placeholder="0.00"
        />
        <Input
          label="Selling Price (₹)"
          type="number"
          min="0"
          step="0.01"
          required
          value={form.sellingPrice}
          error={errors.sellingPrice}
          onChange={(e) => handleChange('sellingPrice', e.target.value)}
          placeholder="0.00"
          helperText={margin > 0 ? `Margin: ${margin}% over cost` : undefined}
        />

        <Input
          label="Cost Price (₹)"
          type="number"
          min="0"
          step="0.01"
          required
          value={form.costPrice}
          error={errors.costPrice}
          onChange={(e) => handleChange('costPrice', e.target.value)}
          placeholder="0.00"
        />
        <Select
          label="GST / Tax Rate"
          value={form.taxRate}
          onChange={(e) => handleChange('taxRate', Number(e.target.value))}
          options={TAX_RATES.map((r) => ({ value: r, label: `${r}%` }))}
          placeholder=""
        />

        <Input
          label={isEditing ? 'Stock Quantity (read-only)' : 'Stock Quantity'}
          type="number"
          min="0"
          required={!isEditing}
          readOnly={isEditing}
          disabled={isEditing}
          value={form.stockQuantity}
          error={errors.stockQuantity}
          onChange={(e) => handleChange('stockQuantity', e.target.value)}
          placeholder="0"
          helperText={
            isEditing
              ? 'Stock changes only via Adjust Stock, so every movement is recorded.'
              : undefined
          }
        />
        <Input
          label="Low-Stock Alert Level"
          type="number"
          min="0"
          required
          value={form.minStockLevel}
          error={errors.minStockLevel}
          onChange={(e) => handleChange('minStockLevel', e.target.value)}
          placeholder="10"
          helperText="Alert when stock falls to this level"
        />

        <Select
          label="Unit of Measurement"
          value={form.unit}
          onChange={(e) => handleChange('unit', e.target.value)}
          options={UNITS.map((u) => ({ value: u, label: u }))}
          placeholder=""
        />

        <div className="sm:col-span-2">
          <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
            Description
          </label>
          <textarea
            rows={3}
            value={form.description}
            onChange={(e) => handleChange('description', e.target.value)}
            placeholder="Short product description shown on invoices"
            className="w-full rounded-lg border border-slate-300 text-sm text-slate-900 placeholder-slate-400 transition-colors hover:border-slate-400 focus:outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-500/20 px-3 py-2"
          />
        </div>
      </div>

      {Number(form.sellingPrice) > 0 && (
        <div className="rounded-lg bg-slate-50 border border-slate-200 px-4 py-3 text-xs text-slate-600">
          <span className="font-semibold text-slate-800">Price preview:</span>{' '}
          Selling {formatCurrency(form.sellingPrice)} &bull; MRP {formatCurrency(form.mrp)} &bull; Cost{' '}
          {formatCurrency(form.costPrice)} &bull; Expected margin{' '}
          <span className="font-semibold text-emerald-600">
            {formatCurrency(Number(form.sellingPrice || 0) - Number(form.costPrice || 0))}
          </span>
        </div>
      )}
    </FormModal>
  );
}