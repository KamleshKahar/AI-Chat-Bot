'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { Plus, Trash2, Search, ShoppingCart, AlertTriangle } from 'lucide-react';
import { calculateSaleTotals, round2, resolvePaymentStatus } from '@/lib/salesLogic';
import { formatCurrency } from '@/lib/formatters';
import { useServerList, useDebouncedValue } from '@/hooks/useServerQuery';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';

/**
 * `Udyam / COD` is a display label, not an API value. The backend's enum has
 * `COD`, so the label is what the UI shows and `COD` is what gets sent. Sending
 * the raw label was previously rejected by validation, or accepted by a looser
 * path and mis-filed the ledger entry.
 */
const PAYMENT_METHOD_OPTIONS = [
  { value: 'UPI', label: 'UPI' },
  { value: 'Cash', label: 'Cash' },
  { value: 'Bank Transfer', label: 'Bank Transfer / NEFT' },
  { value: 'Credit Card', label: 'Credit Card' },
  { value: 'Cheque', label: 'Cheque' },
  { value: 'COD', label: 'Udyam / COD' },
];

/** Translate a form value to the API's payment-method enum. */
function toApiPaymentMethod(value) {
  if (value === 'Udyam / COD') return 'COD';
  return value;
}

/**
 * Create-sale form.
 *
 * `products` is no longer a prop: the catalogue is fetched and searched
 * server-side, because a `<select>` over an unbounded collection cannot work
 * once the API caps `limit` at 100.
 */
export function CreateSaleForm({ customers = [], onSubmit, onCancel, isSubmitting }) {
  const [customerId, setCustomerId] = useState('');
  const [saleDate, setSaleDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [lines, setLines] = useState([]);
  const [discountType, setDiscountType] = useState('percent');
  const [discountValue, setDiscountValue] = useState(0);
  const [shippingCharges, setShippingCharges] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState('UPI');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMode, setPaymentMode] = useState('full');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState({});

  /*
    Server-searched product picker.

    The catalogue used to be passed in as an array and rendered as one flat
    `<select>`. That cannot scale against an API that caps `limit` at 100, and
    it silently hid everything past the first page. Searching is now a `?search=`
    query, so every product in the catalogue is reachable.
  */
  const [productSearch, setProductSearch] = useState('');
  const debouncedProductSearch = useDebouncedValue(productSearch, 300);

  const productQuery = useMemo(
    () => ({
      search: debouncedProductSearch.trim() || undefined,
      status: 'in_stock',
      sort: 'name',
      order: 'asc',
      limit: 25,
    }),
    [debouncedProductSearch]
  );

  const { rows: productResults } = useServerList({ path: '/products', query: productQuery });

  const selectedCustomer = customers.find((c) => c.id === customerId);

  // Sales tax rate derived from the first line item's product (keeps invoices consistent)
  const taxRate = lines.length > 0 ? Number(lines[0].taxRate ?? 18) : 18;

  const totals = useMemo(
    () =>
      calculateSaleTotals({
        items: lines,
        discountType,
        discountValue,
        taxRate,
        shippingCharges,
      }),
    [lines, discountType, discountValue, taxRate, shippingCharges]
  );

  useEffect(() => {
    if (paymentMode === 'full') {
      setPaymentAmount(String(totals.grandTotal));
    } else if (paymentMode === 'custom') {
      setPaymentAmount((prev) => (prev === '' ? '' : String(round2(Number(prev)))));
    }
  }, [paymentMode, totals.grandTotal]);

  const handleAddProduct = (productId) => {
    /*
      Look the product up in the *search results*, not a full catalogue. The
      picker now queries the API, so this is the set the user actually chose
      from.
    */
    const product = productResults.find((p) => p.id === productId);
    if (!product) return;

    setErrors((prev) => ({ ...prev, items: '' }));

    setLines((prev) => {
      const existing = prev.find((line) => line.productId === product.id);
      if (existing) {
        return prev.map((line) =>
          line.productId === product.id
            ? { ...line, quantity: Number(line.quantity) + 1 }
            : line
        );
      }

      return [
        ...prev,
        {
          key: `${product.id}-${Date.now()}`,
          productId: product.id,
          productName: product.name,
          sku: product.sku,
          unit: product.unit,
          taxRate: Number(product.taxRate || 18),
          availableStock: Number(product.stockQuantity || 0),
          quantity: 1,
          unitPrice: Number(product.sellingPrice || 0),
        },
      ];
    });
  };

  const handleQuantityChange = (key, value) => {
    setLines((prev) =>
      prev.map((line) =>
        line.key === key
          ? { ...line, quantity: Math.max(0, Number(value || 0)), lineError: '' }
          : line
      )
    );
    setErrors((prev) => ({ ...prev, items: '' }));
  };

  const handlePriceChange = (key, value) => {
    setLines((prev) =>
      prev.map((line) =>
        line.key === key ? { ...line, unitPrice: Math.max(0, Number(value || 0)) } : line
      )
    );
  };

  const removeLine = (key) => {
    setLines((prev) => prev.filter((line) => line.key !== key));
  };

  const validate = () => {
    const nextErrors = {};

    if (!customerId) nextErrors.customerId = 'Please select a customer for this sale';
    if (lines.length === 0) nextErrors.items = 'Add at least one product to the sale';

    lines.forEach((line) => {
      if (Number(line.quantity) <= 0) {
        nextErrors.items = 'All line items must have a quantity greater than zero';
      }
      if (Number(line.quantity) > line.availableStock) {
        nextErrors.items = `Only ${line.availableStock} ${line.unit} of "${line.productName}" available in stock`;
      }
    });

    const paid = Number(paymentAmount || 0);
    if (paymentMode !== 'credit' && paid < 0) {
      nextErrors.payment = 'Payment amount cannot be negative';
    }
    if (paymentMode === 'custom' && paymentAmount === '') {
      nextErrors.payment = 'Enter the amount received';
    }
    if (paymentMode === 'custom' && paid > totals.grandTotal) {
      nextErrors.payment = 'Payment received cannot exceed the grand total';
    }
    if (discountType === 'percent' && Number(discountValue) > 100) {
      nextErrors.discount = 'Discount cannot exceed 100%';
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  /**
   * Map this form's three payment modes onto the API's vocabulary.
   *
   *   full    -> 'full'     (server settles the invoice in full)
   *   custom  -> 'partial'  (server uses `paymentAmount`)
   *   credit  -> 'none'     (nothing paid, full balance receivable)
   *
   * This mapping is the fix for a silent data-corruption bug. The form used to
   * send `paymentMode: 'credit'`, which is not a value the API accepts; it
   * defaulted to `'full'` and created a *fully paid* invoice for a credit sale.
   * A 201 came back and nothing looked wrong.
   */
  const toApiPaymentMode = (mode) => {
    if (mode === 'credit') return 'none';
    if (mode === 'custom') return 'partial';
    return 'full';
  };

  /**
   * Build the request body.
   *
   * Only inputs are sent. Everything derived — line subtotals, subtotal,
   * discount amount, tax, grand total, paid amount, payment status — is
   * computed server-side from the catalogue and the customer's state, then
   * persisted.
   *
   * The old payload sent `discountPercent` only. The API expects
   * `discountType` + `discountValue`, so Zod stripped the field, the server
   * applied no discount, and a 10%-off sale returned a `grandTotal` ₹424.80
   * *too high* while reporting success. Flat discounts were worse: every rupee
   * of the discount was silently discarded.
   */
  const buildPayload = () => ({
    date: saleDate,
    customerId,

    items: lines.map((line) => ({
      productId: line.productId,
      quantity: Number(line.quantity),
      // Optional: the server re-reads the authoritative price from the
      // catalogue, so a stale price cannot be baked into the invoice.
      unitPrice: Number(line.unitPrice),
    })),

    discountType,
    discountValue: Number(discountValue || 0),
    taxRate: totals.taxRate,
    shippingCharges: Number(shippingCharges || 0),

    paymentMode: toApiPaymentMode(paymentMode),
    // Only meaningful for 'partial', but always send the resolved figure.
    paymentAmount: Number(paymentAmount || 0),
    paymentMethod: toApiPaymentMethod(paymentMethod),

    notes: notes.trim() || undefined,
  });

  const handleSubmit = async () => {
    if (!validate()) return;
    await onSubmit(buildPayload());
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
      {/* Left: Line items */}
      <div className="xl:col-span-2 space-y-4">
        {/* Customer & date */}
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-2xs p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select
              label="Customer"
              required
              value={customerId}
              error={errors.customerId}
              onChange={(e) => {
                setCustomerId(e.target.value);
                setErrors((p) => ({ ...p, customerId: '' }));
              }}
              options={customers.map((c) => ({
                value: c.id,
                label: c.company ? `${c.name} — ${c.company}` : c.name,
              }))}
              placeholder="Select customer"
            />
            <Input
              label="Invoice Date"
              type="date"
              value={saleDate}
              onChange={(e) => setSaleDate(e.target.value)}
            />
          </div>

          {selectedCustomer && (
            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 rounded-lg bg-slate-50 border border-slate-200 px-4 py-2.5 text-xs text-slate-600">
              <span>
                <span className="text-slate-400">GSTIN:</span>{' '}
                <span className="font-mono font-medium text-slate-800">
                  {selectedCustomer.gstin || 'Not provided'}
                </span>
              </span>
              <span>
                <span className="text-slate-400">Phone:</span>{' '}
                <span className="font-medium text-slate-800">{selectedCustomer.phone}</span>
              </span>
              <span>
                <span className="text-slate-400">Outstanding:</span>{' '}
                <span
                  className={`font-semibold ${
                    Number(selectedCustomer.outstandingBalance) > 0 ? 'text-amber-600' : 'text-emerald-600'
                  }`}
                >
                  {formatCurrency(selectedCustomer.outstandingBalance)}
                </span>
              </span>
              <span>
                <span className="text-slate-400">Place of supply:</span>{' '}
                <span className="font-medium text-slate-800">
                  {selectedCustomer.state || selectedCustomer.city}
                </span>
              </span>
            </div>
          )}
        </div>

        {/* Product picker */}
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-2xs p-4">
          <h3 className="text-sm font-semibold text-slate-900 mb-3">Add Products</h3>

          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <Search className="h-4 w-4" />
              </div>
              <input
                type="search"
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                placeholder="Search products by name, SKU or category…"
                className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>
          </div>

          {/* Search results — the catalogue is queried, not shipped whole. */}
          <div className="mt-2 flex flex-col sm:flex-row gap-2">
            <select
              value=""
              onChange={(e) => {
                handleAddProduct(e.target.value);
                setProductSearch('');
              }}
              disabled={productResults.length === 0}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-500/20 cursor-pointer disabled:bg-slate-50 disabled:text-slate-400"
            >
              <option value="">
                {productResults.length === 0
                  ? 'No matching products'
                  : `${productResults.length} product${productResults.length === 1 ? '' : 's'} — select to add`}
              </option>
              {productResults.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {formatCurrency(p.sellingPrice)} ({p.stockQuantity} {p.unit})
                </option>
              ))}
            </select>
          </div>

          {lines.length === 0 ? (
            <div className="mt-4 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center">
              <ShoppingCart className="w-7 h-7 text-slate-300 mx-auto mb-2" />
              <p className="text-sm font-medium text-slate-600">No products added yet</p>
              <p className="text-xs text-slate-400 mt-0.5">
                Select a product above to start building this invoice
              </p>
            </div>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-sm min-w-[600px]">
                <thead className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="pb-2">Product</th>
                    <th className="pb-2 w-24 text-center">Qty</th>
                    <th className="pb-2 w-32">Unit Price</th>
                    <th className="pb-2 w-28 text-right">Amount</th>
                    <th className="pb-2 w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {lines.map((line) => {
                    const overStock = Number(line.quantity) > line.availableStock;
                    return (
                      <tr key={line.key} className="align-top">
                        <td className="py-3 pr-3">
                          <p className="font-semibold text-slate-900 text-xs leading-snug">
                            {line.productName}
                          </p>
                          <p className="text-[11px] text-slate-500 font-mono mt-0.5">{line.sku}</p>
                          <p
                            className={`text-[11px] mt-0.5 ${
                              overStock ? 'text-rose-600 font-medium' : 'text-slate-400'
                            }`}
                          >
                            {overStock ? (
                              <span className="inline-flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3" />
                                Only {line.availableStock} {line.unit} available
                              </span>
                            ) : (
                              `${line.availableStock} ${line.unit} in stock`
                            )}
                          </p>
                        </td>
                        <td className="py-3 px-1">
                          <input
                            type="number"
                            min="0"
                            value={line.quantity}
                            onChange={(e) => handleQuantityChange(line.key, e.target.value)}
                            className={`w-full rounded-lg border px-2 py-1.5 text-sm text-center font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 ${
                              overStock
                                ? 'border-rose-400 text-rose-700'
                                : 'border-slate-300 text-slate-900'
                            }`}
                          />
                        </td>
                        <td className="py-3 px-1">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={line.unitPrice}
                            onChange={(e) => handlePriceChange(line.key, e.target.value)}
                            className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-900 focus:outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-500/20"
                          />
                        </td>
                        <td className="py-3 text-right font-bold text-slate-900 whitespace-nowrap">
                          {formatCurrency(Number(line.quantity) * Number(line.unitPrice))}
                        </td>
                        <td className="py-3 pl-2">
                          <button
                            type="button"
                            onClick={() => removeLine(line.key)}
                            className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition"
                            title="Remove line"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {errors.items && (
            <p className="mt-3 flex items-center gap-1.5 rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-xs font-medium text-rose-700">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              {errors.items}
            </p>
          )}
        </div>

        {/* Notes */}
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-2xs p-4">
          <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
            Sale Notes (optional)
          </label>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Delivery instructions, PO reference, remarks for invoice..."
            className="w-full rounded-lg border border-slate-300 text-sm text-slate-900 placeholder-slate-400 transition-colors hover:border-slate-400 focus:outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-500/20 px-3 py-2"
          />
        </div>
      </div>

      {/* Right: Summary & payment */}
      <div className="space-y-4">
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-2xs p-5 xl:sticky xl:top-20">
          <h3 className="text-sm font-semibold text-slate-900 mb-4">Bill Summary</h3>

          {/* Discount */}
          <div className="grid grid-cols-2 gap-2 mb-3">
            <select
              value={discountType}
              onChange={(e) => {
                setDiscountType(e.target.value);
                setDiscountValue(0);
              }}
              className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs font-medium text-slate-700 focus:outline-none focus:border-indigo-600 cursor-pointer"
            >
              <option value="percent">Discount %</option>
              <option value="flat">Discount ₹</option>
            </select>
            <input
              type="number"
              min="0"
              value={discountValue}
              onChange={(e) => {
                setDiscountValue(e.target.value);
                setErrors((p) => ({ ...p, discount: '' }));
              }}
              placeholder="0"
              className={`rounded-lg border px-2 py-1.5 text-sm text-slate-900 focus:outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-500/20 ${
                errors.discount ? 'border-rose-400' : 'border-slate-300'
              }`}
            />
          </div>

          {errors.discount && (
            <p className="mb-3 text-xs font-medium text-rose-600">{errors.discount}</p>
          )}

          <Input
            label="Shipping / Freight (₹)"
            type="number"
            min="0"
            value={shippingCharges}
            onChange={(e) => setShippingCharges(e.target.value)}
            placeholder="0"
          />

          {/* Totals */}
          <div className="mt-4 space-y-2 border-t border-slate-100 pt-4 text-sm">
            <div className="flex justify-between text-slate-600">
              <span>Subtotal ({totals.totalItems} items)</span>
              <span className="font-semibold text-slate-900">
                {formatCurrency(totals.subtotal)}
              </span>
            </div>

            {totals.discountAmount > 0 && (
              <div className="flex justify-between text-emerald-600">
                <span>
                  Discount
                  {discountType === 'percent' ? ` (${discountValue}%)` : ''}
                </span>
                <span className="font-semibold">− {formatCurrency(totals.discountAmount)}</span>
              </div>
            )}

            <div className="flex justify-between text-slate-600">
              <span>Taxable Amount</span>
              <span className="font-semibold text-slate-900">
                {formatCurrency(totals.taxableAmount)}
              </span>
            </div>

            <div className="flex justify-between text-slate-600">
              <span>GST ({totals.taxRate}%)</span>
              <span className="font-semibold text-slate-900">{formatCurrency(totals.taxAmount)}</span>
            </div>

            {totals.shippingCharges > 0 && (
              <div className="flex justify-between text-slate-600">
                <span>Shipping</span>
                <span className="font-semibold text-slate-900">
                  {formatCurrency(totals.shippingCharges)}
                </span>
              </div>
            )}

            <div className="flex justify-between items-baseline pt-3 border-t border-slate-200">
              <span className="text-sm font-semibold text-slate-900">Grand Total</span>
              <span className="text-xl font-bold text-slate-900">
                {formatCurrency(totals.grandTotal)}
              </span>
            </div>
          </div>

          {/* Payment */}
          <div className="mt-5 border-t border-slate-100 pt-4">
            <p className="text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
              Payment
            </p>

            <div className="grid grid-cols-3 gap-1.5 mb-3">
              {[
                { key: 'full', label: 'Full' },
                { key: 'custom', label: 'Partial' },
                { key: 'credit', label: 'On Credit' },
              ].map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => {
                    setPaymentMode(opt.key);
                    setErrors((p) => ({ ...p, payment: '' }));
                  }}
                  className={`rounded-lg border px-2 py-1.5 text-xs font-semibold transition ${
                    paymentMode === opt.key
                      ? 'border-indigo-600 bg-indigo-600 text-white'
                      : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {paymentMode !== 'credit' && (
              <Input
                label="Amount Received (₹)"
                type="number"
                min="0"
                step="0.01"
                value={paymentAmount}
                error={errors.payment}
                onChange={(e) => {
                  setPaymentMode('custom');
                  setPaymentAmount(e.target.value);
                }}
                disabled={paymentMode === 'full'}
                placeholder="0.00"
              />
            )}

            {paymentMode === 'credit' && (
              <p className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
                Invoice will be created as <strong>Pending</strong> with full balance receivable.
              </p>
            )}

            <div className="mt-3">
              <Select
                label="Payment Method"
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                options={PAYMENT_METHOD_OPTIONS}
                placeholder=""
              />
            </div>

            {paymentMode === 'custom' && paymentAmount !== '' && (
              <div className="mt-3 rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-xs">
                <div className="flex justify-between text-slate-600">
                  <span>Balance due</span>
                  <span
                    className={`font-bold ${
                      round2(Number(paymentAmount)) >= totals.grandTotal
                        ? 'text-emerald-600'
                        : 'text-amber-600'
                    }`}
                  >
                    {formatCurrency(Math.max(0, round2(totals.grandTotal - Number(paymentAmount || 0))))}
                  </span>
                </div>
                <div className="flex justify-between text-slate-500 mt-1">
                  <span>Status</span>
                  <span className="font-semibold text-slate-700">
                    {resolvePaymentStatus(totals.grandTotal, paymentAmount)}
                  </span>
                </div>
              </div>
            )}
          </div>

          <div className="mt-5 space-y-2">
            <Button
              variant="primary"
              icon={Plus}
              className="w-full"
              onClick={handleSubmit}
              loading={isSubmitting}
              disabled={lines.length === 0}
            >
              Create Sale &amp; Invoice
            </Button>
            <Button variant="outline" className="w-full" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}