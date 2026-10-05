'use client';

import React, { createContext, useContext, useCallback, useMemo, useState } from 'react';
import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from '@/lib/apiClient';
import { useServerList, useServerResource } from '@/hooks/useServerQuery';

/**
 * Shared reference data and mutations.
 *
 * This context used to hold seven collections in `localStorage` and perform the
 * bookkeeping itself — deducting stock, incrementing customer totals, minting
 * document codes, and mirroring every write into storage. All of that is now a
 * single server-side transaction per operation, so none of it belongs here.
 *
 * What remains is exactly two things:
 *
 *   1. Data that genuinely is shared app-wide and small — the company profile
 *      and the category list (deliberately unpaginated upstream, because filter
 *      dropdowns need the whole set).
 *   2. Mutations, which call the API and then bump `revision` so that every
 *      mounted page refetches.
 *
 * Lists (products, customers, sales, invoices, transactions) are **not** here.
 * Each page owns its own query parameters and fetches its own page of rows,
 * because that is what makes server-side filtering and pagination possible.
 */

/**
 * Incremented after every successful mutation. Pass it to a query hook as
 * `refreshKey` to invalidate that query.
 */
const DataContext = createContext(null);

export function DataProvider({ children }) {
  const [revision, setRevision] = useState(0);
  const [pendingCategoryIds, setPendingCategoryIds] = useState([]);

  /** Tell every mounted page its data may be stale. */
  const invalidate = useCallback(() => setRevision((r) => r + 1), []);

  // --- Shared reference data ---------------------------------------------

  const { data: company } = useServerResource({ path: '/company', refreshKey: revision });

  // `/api/categories` is intentionally unpaginated upstream — a category filter
  // dropdown that only shows the first ten categories is worse than useless.
  const { rows: categories } = useServerList({ path: '/categories', refreshKey: revision });

  // --- Catalogue mutations ------------------------------------------------

  const addProduct = useCallback(
    async (productData) => {
      const { data } = await apiPost('/products', productData);
      invalidate();
      return data;
    },
    [invalidate]
  );

  const updateProduct = useCallback(
    async (id, updatedData) => {
      // `stockQuantity` is intentionally not forwarded: the backend rejects
      // direct stock writes so every movement leaves an audit row. Use
      // `adjustStock` instead.
      const { stockQuantity, ...safe } = updatedData ?? {};
      const { data } = await apiPut(`/products/${encodeURIComponent(id)}`, safe);
      invalidate();
      return data;
    },
    [invalidate]
  );

  const deleteProduct = useCallback(
    async (id) => {
      const { data } = await apiDelete(`/products/${encodeURIComponent(id)}`);
      invalidate();
      return data;
    },
    [invalidate]
  );

  /**
   * @param {string} id          product code, e.g. 'PRD-101'
   * @param {number} delta       signed: positive adds stock, negative removes
   * @param {string} reason      short audit reason
   * @param {string} [notes]     free-text detail, stored separately by the API
   */
  const adjustStock = useCallback(
    async (id, delta, reason = 'Manual Adjustment', notes) => {
      const quantity = Math.abs(Number(delta) || 0);
      const { data } = await apiPost(`/products/${encodeURIComponent(id)}/stock-adjustments`, {
        // The API wants an explicit direction and a positive quantity; the UI
        // works in signed deltas.
        mode: Number(delta) >= 0 ? 'add' : 'remove',
        quantity,
        reason,
        ...(notes ? { notes } : {}),
      });
      invalidate();
      return data;
    },
    [invalidate]
  );

  // --- Customer mutations -------------------------------------------------

  const addCustomer = useCallback(
    async (customerData) => {
      const { data } = await apiPost('/customers', customerData);
      invalidate();
      return data;
    },
    [invalidate]
  );

  const updateCustomer = useCallback(
    async (id, updatedData) => {
      const { data } = await apiPut(`/customers/${encodeURIComponent(id)}`, updatedData);
      invalidate();
      return data;
    },
    [invalidate]
  );

  const deleteCustomer = useCallback(
    async (id) => {
      const { data } = await apiDelete(`/customers/${encodeURIComponent(id)}`);
      invalidate();
      return data;
    },
    [invalidate]
  );

  const getCustomer = useCallback(async (id) => {
    const { data } = await apiGet(`/customers/${encodeURIComponent(id)}`);
    return data;
  }, []);

  // --- Category mutations -------------------------------------------------

  const addCategory = useCallback(
    async (categoryData) => {
      const { data } = await apiPost('/categories', categoryData);
      invalidate();
      return data;
    },
    [invalidate]
  );

  const updateCategory = useCallback(
    async (id, updatedData) => {
      const { data } = await apiPatch(`/categories/${encodeURIComponent(id)}`, updatedData);
      invalidate();
      return data;
    },
    [invalidate]
  );

  const deleteCategory = useCallback(
    async (id) => {
      const { data } = await apiDelete(`/categories/${encodeURIComponent(id)}`);
      invalidate();
      setPendingCategoryIds((prev) => [...prev, id]);
      return data;
    },
    [invalidate]
  );

  // --- Sales & invoices ---------------------------------------------------

  /**
   * Create a sale and its invoice.
   *
   * Previously a six-write client-side transaction. Now it is one atomic
   * server-side transaction (codes, stock, customer totals, frozen customer
   * snapshot, ledger entry) — so a returned invoice is guaranteed consistent
   * with the stock and the customer balance, and a 409 means nothing was
   * written at all. There is no partial state to compensate for.
   *
   * @returns {Promise<{ sale: object, invoice: object }>}
   */
  const createSale = useCallback(
    async (saleData) => {
      const { data } = await apiPost('/sales', saleData);
      invalidate();
      return data;
    },
    [invalidate]
  );

  /** Record a payment against an invoice. */
  const updateInvoicePayment = useCallback(
    async (invoiceId, amount, method = 'UPI', extra = {}) => {
      const { data } = await apiPost(
        `/invoices/${encodeURIComponent(invoiceId)}/payments`,
        { amount: Number(amount), paymentMethod: method, ...extra }
      );
      invalidate();
      return data;
    },
    [invalidate]
  );

  /**
   * Restore the seeded demo dataset.
   *
   * This is a destructive, ADMIN-only server operation gated behind
   * `ENABLE_SEED_ENDPOINT` in `backend/.env`. It is not a client-side state
   * reset any more, so failures are surfaced rather than swallowed.
   */
  const resetToDemoData = useCallback(async () => {
    const { data } = await apiPost('/seed/reset', {});
    invalidate();
    return data;
  }, [invalidate]);

  const value = useMemo(
    () => ({
      /** Bumped after every mutation; pass to a query hook as `refreshKey`. */
      revision,
      invalidate,

      company,
      categories,
      pendingCategoryIds,

      addProduct,
      updateProduct,
      deleteProduct,
      adjustStock,

      addCustomer,
      updateCustomer,
      deleteCustomer,
      getCustomer,

      addCategory,
      updateCategory,
      deleteCategory,

      createSale,
      updateInvoicePayment,

      resetToDemoData,
    }),
    [
      revision,
      invalidate,
      company,
      categories,
      pendingCategoryIds,
      addProduct,
      updateProduct,
      deleteProduct,
      adjustStock,
      addCustomer,
      updateCustomer,
      deleteCustomer,
      getCustomer,
      addCategory,
      updateCategory,
      deleteCategory,
      createSale,
      updateInvoicePayment,
      resetToDemoData,
    ]
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData() {
  const context = useContext(DataContext);
  if (!context) {
    throw new Error('useData must be used within a DataProvider');
  }
  return context;
}

export { DataContext };
