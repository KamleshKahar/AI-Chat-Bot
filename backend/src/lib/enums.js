/**
 * Translation layer between database enums and the exact string literals the
 * FlowPilot frontend already uses.
 *
 * The frontend's `StatusBadge`, filters and mock data speak human labels
 * ("Paid", "Bank Transfer", "Income (Partial)"). The database speaks stable
 * enums (PAID, BANK_TRANSFER, SALE_PAYMENT). Everything crossing the API
 * boundary goes through this file so the mapping exists in exactly one place.
 */
import { d } from './decimal.js';

// ---------------------------------------------------------------------------
// Product stock status (derived, never stored)
// ---------------------------------------------------------------------------

export const STOCK_STATUS = {
  IN_STOCK: 'in_stock',
  LOW_STOCK: 'low_stock',
  OUT_OF_STOCK: 'out_of_stock',
};

export const STOCK_STATUS_VALUES = Object.values(STOCK_STATUS);

/** Mirrors frontend/lib/salesLogic.js + DataContext.js derivation. */
export function deriveStockStatus(stockQuantity, minStockLevel) {
  const qty = Number(stockQuantity || 0);
  if (qty <= 0) return STOCK_STATUS.OUT_OF_STOCK;
  if (qty <= Number(minStockLevel || 0)) return STOCK_STATUS.LOW_STOCK;
  return STOCK_STATUS.IN_STOCK;
}

// ---------------------------------------------------------------------------
// Invoice payment status
// ---------------------------------------------------------------------------

/** Labels the frontend renders. `Overdue` is computed, never stored. */
export const PAYMENT_STATUS = {
  PENDING: 'Pending',
  PARTIAL: 'Partial',
  PAID: 'Paid',
  OVERDUE: 'Overdue',
};

export const PAYMENT_STATUS_VALUES = Object.values(PAYMENT_STATUS);

/** DB enum -> frontend label. */
export function toPaymentStatusLabel(dbStatus, { dueDate, balanceDue, today }) {
  const outstanding = Number(d(balanceDue || 0)) > 0;
  const overdue =
    dbStatus !== 'PAID' &&
    outstanding &&
    dueDate &&
    String(dueDate).slice(0, 10) < today;

  if (overdue) return PAYMENT_STATUS.OVERDUE;
  return PAYMENT_STATUS[dbStatus] || PAYMENT_STATUS.PENDING;
}

/**
 * Frontend label (or query value) -> persisted enum, or the pseudo-enum
 * 'OVERDUE' when the caller explicitly asked for overdue invoices.
 * Returns null for unrecognised input so callers can 400 properly.
 */
export function fromPaymentStatusLabel(label) {
  if (!label) return null;
  const needle = String(label).trim().toLowerCase();
  const found = Object.entries(PAYMENT_STATUS).find(
    ([, v]) => v.toLowerCase() === needle
  );
  return found ? found[0] : null;
}

// ---------------------------------------------------------------------------
// Payment methods
// ---------------------------------------------------------------------------

export const PAYMENT_METHOD = {
  UPI: 'UPI',
  CASH: 'Cash',
  BANK_TRANSFER: 'Bank Transfer',
  CHEQUE: 'Cheque',
  CREDIT_CARD: 'Credit Card',
  COD: 'COD',
};

export const PAYMENT_METHOD_VALUES = Object.values(PAYMENT_METHOD);

const METHOD_LOOKUP = new Map();
for (const [key, label] of Object.entries(PAYMENT_METHOD)) {
  METHOD_LOOKUP.set(label.toLowerCase(), key);
  METHOD_LOOKUP.set(key.toLowerCase(), key);
  METHOD_LOOKUP.set(label.replace(/\s+/g, '_').toLowerCase(), key);
}

/**
 * Accepts "Bank Transfer", "bank transfer", "BANK_TRANSFER" or "bank_transfer".
 * Returns null when unknown.
 */
export function toPaymentMethodEnum(value) {
  if (!value) return null;
  return METHOD_LOOKUP.get(String(value).trim().toLowerCase()) ?? null;
}

export function toPaymentMethodLabel(value) {
  if (!value) return null;
  return PAYMENT_METHOD[value] ?? String(value);
}

// ---------------------------------------------------------------------------
// Ledger entry display labels (replaces the free-form `type` strings)
// ---------------------------------------------------------------------------

export const LEDGER_TYPE = {
  SALE_PAYMENT: 'SALE_PAYMENT',
  PURCHASE_PAYMENT: 'PURCHASE_PAYMENT',
  EXPENSE: 'EXPENSE',
  ADJUSTMENT: 'ADJUSTMENT',
  REFUND: 'REFUND',
  OPENING: 'OPENING',
};

/**
 * Reproduces the labels the frontend's transactions table displays.
 * `isSettlement` distinguishes money received against a pre-existing invoice
 * ("Payment Received") from the payment taken at the point of sale
 * ("Income" / "Income (Partial)").
 */
export function toLedgerTypeLabel(type, { direction, isSettlement }) {
  switch (type) {
    case 'SALE_PAYMENT':
      if (isSettlement) return 'Payment Received';
      return direction === 'OUT' ? 'Refund' : 'Income';
    case 'PURCHASE_PAYMENT':
      return 'Stock Purchase';
    case 'ADJUSTMENT':
      return direction === 'OUT' ? 'Stock Out' : 'Stock In';
    case 'EXPENSE':
      return 'Expense';
    case 'REFUND':
      return 'Refund';
    case 'OPENING':
      return 'Opening Balance';
    default:
      return String(type);
  }
}

export function toLedgerStatusLabel(status) {
  switch (status) {
    case 'SUCCESS':
      return 'Success';
    case 'PENDING':
      return 'Pending';
    case 'FAILED':
      return 'Failed';
    default:
      return String(status);
  }
}

// ---------------------------------------------------------------------------
// Customer status
// ---------------------------------------------------------------------------

export function toCustomerStatus(value) {
  const needle = String(value || '').toLowerCase();
  if (needle === 'active' || needle === 'inactive') return needle;
  return null;
}