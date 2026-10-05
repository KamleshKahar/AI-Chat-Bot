import { asMoney, asNum, d } from '../lib/decimal.js';
import { toDateOnly, todayDateOnly, prisma } from '../config/prisma.js';
import {
  deriveStockStatus,
  toLedgerStatusLabel,
  toLedgerTypeLabel,
  toPaymentMethodLabel,
  toPaymentStatusLabel,
} from '../lib/enums.js';

/**
 * Serializers: database row -> the exact JSON shape the FlowPilot frontend
 * already consumes.
 *
 * Two conventions matter here and are relied upon across the whole API:
 *
 *  1. `id` is the human-readable document code (PRD-101, CUST-001,
 *     INV-2026-001), never the numeric surrogate key. This is what lets the
 *     existing frontend keep using `row.id`, `/invoices/${row.invoiceNumber}`
 *     and `items.find(i => i.productId === product.id)` without modification.
 *
 *  2. Money is emitted as a JSON number rounded to 2dp, because
 *     DECIMAL(14,2) maxes out well below Number.MAX_SAFE_INTEGER.
 */

/**
 * Today's date, captured once per request cycle so every serializer within a
 * single response agrees on what "Overdue" means.
 */
let TODAY = todayDateOnly();
export function setSerializerToday(value) {
  TODAY = value;
}
export function getSerializerToday() {
  return TODAY;
}

// ---------------------------------------------------------------------------
// Catalogue
// ---------------------------------------------------------------------------

export function serializeCategory(row) {
  return {
    id: row.code,
    code: row.code,
    shortCode: row.short_code ?? row.shortCode ?? null,
    name: row.name,
    description: row.description ?? null,
    isActive: row.is_active ?? row.isActive ?? true,
  };
}

export function serializeProduct(row) {
  // Works for both the raw-SQL row (snake_case aliases) and a Prisma model.
  const stockQuantity = Number(row.stock_quantity ?? row.stockQuantity ?? 0);
  const minStockLevel = Number(row.min_stock_level ?? row.minStockLevel ?? 0);
  const costPrice = d(row.cost_price ?? row.costPrice ?? 0);

  const categoryName = row.category_name ?? row.category?.name ?? null;
  const categoryCode = row.category_code ?? row.category?.code ?? null;

  return {
    id: row.code,
    name: row.name,
    sku: row.sku,
    // The frontend's ProductFormModal submits and its filter dropdowns compare
    // the category *name*, so `category` is the name string. `categoryId` is
    // offered for callers that want the stable key.
    category: categoryName,
    categoryId: categoryCode,
    categoryCode,
    mrp: asMoney(row.mrp),
    sellingPrice: asMoney(row.selling_price ?? row.sellingPrice),
    costPrice: asMoney(costPrice),
    stockQuantity,
    minStockLevel,
    unit: row.unit ?? 'pcs',
    taxRate: asNum(row.tax_rate ?? row.taxRate),
    description: row.description ?? null,
    hsnCode: row.hsn_code ?? row.hsnCode ?? null,
    // Derived server-side; the frontend may recompute it but never has to.
    status:
      row.stock_status ??
      deriveStockStatus(stockQuantity, minStockLevel),
    stockValue: asMoney(
      row.stock_value !== undefined && row.stock_value !== null
        ? d(row.stock_value)
        : d(stockQuantity).mul(costPrice)
    ),
    isActive: row.is_active ?? row.isActive ?? true,
    createdAt: row.created_at ?? row.createdAt ?? null,
  };
}

export function serializeStockMovement(row) {
  return {
    id: String(row.id),
    productId: row.productId,
    type: row.type,
    quantityDelta: Number(row.quantityDelta),
    stockAfter: Number(row.stockAfter),
    unitCost: row.unitCost === null || row.unitCost === undefined ? null : asMoney(row.unitCost),
    referenceType: row.referenceType ?? null,
    referenceId: row.referenceId ?? null,
    reason: row.reason ?? null,
    notes: row.notes ?? null,
    createdAt: row.createdAt ?? null,
  };
}

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------

export function serializeCustomer(row) {
  return {
    id: row.code,
    name: row.name,
    company: row.company ?? null,
    email: row.email ?? null,
    phone: row.phone ?? null,
    address: row.address ?? null,
    city: row.city ?? null,
    state: row.state ?? null,
    pincode: row.pincode ?? null,
    gstin: row.gstin ?? null,
    creditLimit: asMoney(row.credit_limit ?? row.creditLimit ?? 0),
    // Derived live from invoices + opening balance.
    totalPurchases: asMoney(row.total_purchases ?? row.totalPurchases ?? 0),
    outstandingBalance: asMoney(row.outstanding_balance ?? row.outstandingBalance ?? 0),
    ordersCount: Number(row.orders_count ?? row.ordersCount ?? 0),
    status: row.status ?? 'active',
    joinedDate: toDateOnly(row.joined_at ?? row.joinedAt ?? row.joinedDate),
  };
}

// ---------------------------------------------------------------------------
// Invoice items
// ---------------------------------------------------------------------------

function serializeItem(row) {
  const quantity = Number(row.quantity);
  const unitPrice = asMoney(row.unit_price ?? row.unitPrice);

  return {
    id: String(row.id ?? `${row.productId}-${row.sortOrder ?? 0}`),
    productId: row.productCode ?? row.productId ?? null,
    productName: row.product_name ?? row.productName,
    sku: row.sku,
    unit: row.unit ?? null,
    hsnCode: row.hsn_code ?? row.hsnCode ?? null,
    quantity,
    unitPrice,
    // Pre-discount line amount — the field the frontend's sale tables read.
    subtotal: asMoney(d(quantity).mul(unitPrice)),
    // Net-of-discount and tax figures, for anything that needs them.
    discountAmount: asMoney(row.discountAmount ?? row.discount_amount ?? 0),
    taxableValue: asMoney(row.taxableValue ?? row.taxable_value ?? 0),
    taxRate: asNum(row.taxRate ?? row.tax_rate ?? 0),
    cgstAmount: asMoney(row.cgstAmount ?? row.cgst_amount ?? 0),
    sgstAmount: asMoney(row.sgstAmount ?? row.sgst_amount ?? 0),
    igstAmount: asMoney(row.igstAmount ?? row.igst_amount ?? 0),
    lineTotal: asMoney(row.lineTotal ?? row.line_total ?? 0),
  };
}

/**
 * Join the product code onto an item so `item.productId` comes back as
 * 'PRD-101' like the rest of the API's identifiers.
 */
export async function attachProductCodes(invoice, db = prisma) {
  if (!invoice?.items?.length) return invoice;
  const ids = invoice.items.map((i) => i.productId).filter((id) => id !== null && id !== undefined);
  if (ids.length === 0) return invoice;

  const products = await db.product.findMany({
    where: { id: { in: [...new Set(ids)].map(Number) } },
    select: { id: true, code: true },
  });
  const byId = new Map(products.map((p) => [p.id, p.code]));

  return {
    ...invoice,
    items: invoice.items.map((item) => ({
      ...item,
      productCode: item.productId === null ? null : (byId.get(item.productId) ?? null),
    })),
  };
}

// ---------------------------------------------------------------------------
// Invoices & sales — one row, two projections
// ---------------------------------------------------------------------------

function invoiceBase(row) {
  const paidAmount = d(row.paid_amount ?? row.paidAmount ?? 0);
  const grandTotal = d(row.grand_total ?? row.grandTotal ?? 0);
  const balanceDue = d(row.balance_due ?? row.balanceDue ?? 0);
  const dueDate = toDateOnly(row.due_date ?? row.dueDate);

  return {
    invoiceDate: toDateOnly(row.invoice_date ?? row.invoiceDate ?? row.date),
    dueDate,
    subtotal: asMoney(row.subtotal),
    discountType: row.discount_type ?? row.discountType ?? 'percent',
    discountValue: asMoney(row.discount_value ?? row.discountValue ?? 0),
    discountPercent: asNum(row.discount_percent ?? row.discountPercent ?? 0),
    discountAmount: asMoney(row.discount_amount ?? row.discountAmount ?? 0),
    taxableAmount: asMoney(row.taxable_amount ?? row.taxableAmount ?? 0),
    taxType: row.tax_type ?? row.taxType ?? 'CGST_SGST',
    taxRate: asNum(row.tax_rate ?? row.taxRate ?? 0),
    cgstAmount: asMoney(row.cgst_amount ?? row.cgstAmount ?? 0),
    sgstAmount: asMoney(row.sgst_amount ?? row.sgstAmount ?? 0),
    igstAmount: asMoney(row.igst_amount ?? row.igstAmount ?? 0),
    taxAmount: asMoney(row.tax_amount ?? row.taxAmount ?? 0),
    shippingCharges: asMoney(row.shipping_charges ?? row.shippingCharges ?? 0),
    grandTotal: asMoney(grandTotal),
    paidAmount: asMoney(paidAmount),
    balanceDue: asMoney(balanceDue),
    paymentStatus: toPaymentStatusLabel(row.payment_status ?? row.paymentStatus, {
      dueDate,
      balanceDue,
      today: TODAY,
    }),
    paymentMethod: toPaymentMethodLabel(row.payment_method ?? row.paymentMethod),
    notes: row.notes ?? null,
    terms: row.terms ?? null,
    status: row.status ?? 'CONFIRMED',
  };
}

/** POS-shaped projection used by the Sales screen. */
export function serializeSale(row) {
  const base = invoiceBase(row);
  return {
    id: row.sale_code ?? row.saleCode ?? row.id,
    invoiceNumber: row.invoice_number ?? row.invoiceNumber ?? null,
    date: base.invoiceDate,
    customerId: row.customer_code ?? row.customerCode ?? row.customerId ?? null,
    customerName: row.snapshot_name ?? row.snapshotName ?? null,
    customerCompany: row.snapshot_company ?? row.snapshotCompany ?? null,
    items: (row.items ?? []).map(serializeItem),
    subtotal: base.subtotal,
    discountPercent: base.discountPercent,
    discountAmount: base.discountAmount,
    taxableAmount: base.taxableAmount,
    taxRate: base.taxRate,
    taxAmount: base.taxAmount,
    grandTotal: base.grandTotal,
    paidAmount: base.paidAmount,
    balanceDue: base.balanceDue,
    paymentStatus: base.paymentStatus,
    paymentMethod: base.paymentMethod,
    notes: base.notes,
    dueDate: base.dueDate,
    taxType: base.taxType,
    cgstAmount: base.cgstAmount,
    sgstAmount: base.sgstAmount,
    igstAmount: base.igstAmount,
    shippingCharges: base.shippingCharges,
  };
}

/** Document-shaped projection used by the Invoices screen and the print view. */
export function serializeInvoice(row) {
  const base = invoiceBase(row);
  return {
    id: row.invoice_number ?? row.invoiceNumber ?? row.id,
    saleId: row.sale_code ?? row.saleCode ?? null,
    date: base.invoiceDate,
    dueDate: base.dueDate,
    // Always the frozen snapshot, never a live join to `customers`.
    customer: {
      id: row.customer_code ?? row.customerCode ?? row.customerId ?? null,
      name: row.snapshot_name ?? row.snapshotName ?? null,
      company: row.snapshot_company ?? row.snapshotCompany ?? null,
      email: row.snapshot_email ?? row.snapshotEmail ?? null,
      phone: row.snapshot_phone ?? row.snapshotPhone ?? null,
      address: row.snapshot_address ?? row.snapshotAddress ?? null,
      city: row.snapshot_city ?? row.snapshotCity ?? null,
      state: row.snapshot_state ?? row.snapshotState ?? null,
      pincode: row.snapshot_pincode ?? row.snapshotPincode ?? null,
      gstin: row.snapshot_gstin ?? row.snapshotGstin ?? null,
    },
    items: (row.items ?? []).map(serializeItem),
    subtotal: base.subtotal,
    discountPercent: base.discountPercent,
    discountAmount: base.discountAmount,
    taxableAmount: base.taxableAmount,
    taxRate: base.taxRate,
    taxAmount: base.taxAmount,
    cgstAmount: base.cgstAmount,
    sgstAmount: base.sgstAmount,
    igstAmount: base.igstAmount,
    taxType: base.taxType,
    shippingCharges: base.shippingCharges,
    grandTotal: base.grandTotal,
    paidAmount: base.paidAmount,
    balanceDue: base.balanceDue,
    paymentStatus: base.paymentStatus,
    paymentMethod: base.paymentMethod,
    notes: base.notes,
    terms: base.terms,
    status: base.status,
    createdAt: row.created_at ?? row.createdAt ?? null,
  };
}

export function serializePayment(row) {
  return {
    id: row.paymentCode ?? row.payment_code ?? String(row.id),
    invoiceId: row.invoiceNumber ?? row.invoice_number ?? null,
    amount: asMoney(row.amount),
    paymentMethod: toPaymentMethodLabel(row.paymentMethod ?? row.payment_method),
    reference: row.reference ?? null,
    paidAt: row.paidAt ?? row.paid_at ?? null,
    notes: row.notes ?? null,
  };
}

// ---------------------------------------------------------------------------
// Ledger (the `transactions` collection)
// ---------------------------------------------------------------------------

export function serializeTransaction(row) {
  const direction = row.direction ?? 'IN';
  return {
    id: row.entry_code ?? row.entryCode ?? String(row.id),
    date: toDateOnly(row.entry_date ?? row.entryDate),
    type: toLedgerTypeLabel(row.type, {
      direction,
      isSettlement: Boolean(row.is_settlement ?? row.isSettlement),
    }),
    reference: row.reference ?? row.invoice_number ?? null,
    customer: row.customer_name ?? row.supplier_name ?? null,
    method: toPaymentMethodLabel(row.payment_method ?? row.paymentMethod) ?? '—',
    amount: asMoney(row.amount),
    status: toLedgerStatusLabel(row.status),
    direction,
    entryType: row.type,
    invoiceId: row.invoice_number ?? null,
    notes: row.notes ?? null,
  };
}

// ---------------------------------------------------------------------------
// Company & users
// ---------------------------------------------------------------------------

export function serializeCompany(row) {
  return {
    name: row.name,
    tagline: row.tagline ?? null,
    gstin: row.gstin ?? null,
    pan: row.pan ?? null,
    email: row.email ?? null,
    phone: row.phone ?? null,
    address: row.address ?? null,
    city: row.city ?? null,
    state: row.state ?? null,
    pincode: row.pincode ?? null,
    bankName: row.bankName ?? null,
    bankAccount: row.bankAccount ?? null,
    ifscCode: row.ifscCode ?? null,
    upiId: row.upiId ?? null,
    invoicePrefix: row.invoicePrefix,
    invoiceTerms: row.invoiceTerms ?? null,
    paymentTermDays: row.paymentTermDays,
    financialYearFrom: row.financialYearFrom,
    logoUrl: row.logoUrl ?? null,
  };
}

export function serializeUser(row) {
  return {
    id: String(row.id),
    name: row.name,
    email: row.email,
    role: row.role,
    phone: row.phone ?? null,
    isActive: row.isActive,
    lastLoginAt: row.lastLoginAt ?? null,
  };
}