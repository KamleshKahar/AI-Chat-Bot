import { z } from '../schemas/common.js';

/**
 * Response schemas for the OpenAPI document.
 *
 * These describe the *wire format* — i.e. what frontend/lib and the React
 * components actually receive. They are deliberately written next to the
 * serializers (src/serializers/index.js) so a change to either shows up as a
 * diff rather than as a silent contract break.
 */

export const UserSchema = z
  .object({
    id: z.string(),
    name: z.string().openapi({ example: 'Kamlesh Patel' }),
    email: z.string().email().openapi({ example: 'admin@flowpilot.in' }),
    role: z.enum(['ADMIN', 'MANAGER', 'CASHIER', 'VIEWER']),
    phone: z.string().nullable(),
    isActive: z.boolean(),
    lastLoginAt: z.string().nullable(),
  })
  .openapi('User');

export const LoginResponseSchema = z
  .object({
    data: z.object({
      token: z.string().openapi({ example: 'eyJhbGciOiJIUzI1NiIs...' }),
      user: UserSchema,
    }),
  })
  .openapi('LoginResponse');

export const CompanySchema = z
  .object({
    name: z.string(),
    tagline: z.string().nullable(),
    gstin: z.string().nullable(),
    pan: z.string().nullable(),
    email: z.string().nullable(),
    phone: z.string().nullable(),
    address: z.string().nullable(),
    city: z.string().nullable(),
    state: z.string().nullable().openapi({ example: 'Maharashtra' }),
    pincode: z.string().nullable(),
    bankName: z.string().nullable(),
    bankAccount: z.string().nullable(),
    ifscCode: z.string().nullable(),
    upiId: z.string().nullable(),
    invoicePrefix: z.string(),
    invoiceTerms: z.string().nullable(),
    paymentTermDays: z.number().int(),
    financialYearFrom: z.number().int(),
    logoUrl: z.string().nullable(),
  })
  .openapi('Company');

export const CategorySchema = z
  .object({
    id: z.string().openapi({ example: 'CAT-01' }),
    code: z.string().openapi({ example: 'CAT-01' }),
    shortCode: z.string().nullable().openapi({ example: 'ELEC' }),
    name: z.string().openapi({ example: 'Electronics & Peripherals' }),
    description: z.string().nullable(),
    isActive: z.boolean(),
  })
  .openapi('Category');

export const ProductSchema = z
  .object({
    id: z.string().openapi({ example: 'PRD-101' }),
    name: z.string(),
    sku: z.string().openapi({ example: 'ELEC-BC-01' }),
    // The category NAME, matching what the frontend's forms and filters use.
    category: z.string().nullable().openapi({ example: 'Electronics & Peripherals' }),
    categoryId: z.string().nullable().openapi({ example: 'CAT-01' }),
    mrp: z.number(),
    sellingPrice: z.number(),
    costPrice: z.number(),
    stockQuantity: z.number().int(),
    minStockLevel: z.number().int(),
    unit: z.string(),
    taxRate: z.number(),
    description: z.string().nullable(),
    status: z.enum(['in_stock', 'low_stock', 'out_of_stock']),
    stockValue: z.number(),
    isActive: z.boolean(),
  })
  .openapi('Product');

export const CustomerSchema = z
  .object({
    id: z.string().openapi({ example: 'CUST-001' }),
    name: z.string(),
    company: z.string().nullable(),
    email: z.string().nullable(),
    phone: z.string().nullable(),
    address: z.string().nullable(),
    city: z.string().nullable(),
    state: z.string().nullable(),
    pincode: z.string().nullable(),
    gstin: z.string().nullable(),
    creditLimit: z.number(),
    // Derived live from invoices, never a cached column.
    totalPurchases: z.number(),
    outstandingBalance: z.number(),
    ordersCount: z.number().int(),
    status: z.enum(['active', 'inactive']),
    joinedDate: z.string().nullable(),
  })
  .openapi('Customer');

export const SaleItemSchema = z
  .object({
    id: z.string(),
    productId: z.string().nullable().openapi({ example: 'PRD-101' }),
    productName: z.string(),
    sku: z.string(),
    unit: z.string().nullable(),
    quantity: z.number().int(),
    unitPrice: z.number(),
    subtotal: z.number(),
    discountAmount: z.number(),
    taxableValue: z.number(),
    taxRate: z.number(),
    cgstAmount: z.number(),
    sgstAmount: z.number(),
    igstAmount: z.number(),
    lineTotal: z.number(),
  })
  .openapi('SaleItem');

export const SaleSchema = z
  .object({
    id: z.string().openapi({ example: 'SALE-1001' }),
    invoiceNumber: z.string().openapi({ example: 'INV-2026-001' }),
    date: z.string().openapi({ example: '2026-10-03' }),
    customerId: z.string().nullable(),
    customerName: z.string().nullable(),
    customerCompany: z.string().nullable(),
    items: z.array(SaleItemSchema),
    subtotal: z.number(),
    discountPercent: z.number(),
    discountAmount: z.number(),
    taxRate: z.number(),
    taxAmount: z.number(),
    grandTotal: z.number(),
    paidAmount: z.number(),
    balanceDue: z.number(),
    paymentStatus: z.enum(['Pending', 'Partial', 'Paid', 'Overdue']),
    paymentMethod: z.string(),
    notes: z.string().nullable(),
    dueDate: z.string().nullable(),
    taxType: z.enum(['CGST_SGST', 'IGST']),
    cgstAmount: z.number(),
    sgstAmount: z.number(),
    igstAmount: z.number(),
    shippingCharges: z.number(),
  })
  .openapi('Sale');

export const InvoiceSchema = SaleSchema.omit({
  invoiceNumber: true,
  customerId: true,
  customerName: true,
  customerCompany: true,
})
  .extend({
    id: z.string().openapi({ example: 'INV-2026-001' }),
    saleId: z.string().openapi({ example: 'SALE-1001' }),
    // Frozen at the time of issue; later customer edits never alter it.
    customer: z.object({
      id: z.string().nullable(),
      name: z.string().nullable(),
      company: z.string().nullable(),
      email: z.string().nullable(),
      phone: z.string().nullable(),
      address: z.string().nullable(),
      city: z.string().nullable(),
      state: z.string().nullable(),
      pincode: z.string().nullable(),
      gstin: z.string().nullable(),
    }),
    terms: z.string().nullable(),
    createdAt: z.string().nullable(),
  })
  .openapi('Invoice');

export const TransactionSchema = z
  .object({
    id: z.string().openapi({ example: 'TXN-901' }),
    date: z.string(),
    type: z.string().openapi({ example: 'Income (Partial)' }),
    reference: z.string().nullable(),
    customer: z.string().nullable(),
    method: z.string(),
    amount: z.number(),
    status: z.string().openapi({ example: 'Success' }),
    direction: z.enum(['IN', 'OUT']),
    entryType: z.string(),
    notes: z.string().nullable(),
  })
  .openapi('Transaction');

export const DashboardSummarySchema = z
  .object({
    // Wrapped in the standard `{ data }` envelope like every other success
    // response, so a client never has to special-case this endpoint. The
    // `metrics` key is kept inside `data` because it is the meaningful name
    // for the payload.
    data: z.object({
      metrics: z.object({
        totalRevenue: z.number(),
        totalSalesValue: z.number(),
        totalOrders: z.number().int(),
        totalOutstanding: z.number(),
        totalProducts: z.number().int(),
        lowStockCount: z.number().int(),
        outOfStockCount: z.number().int(),
        lowStockProducts: z.array(ProductSchema),
        outOfStockProducts: z.array(ProductSchema),
        totalInventoryValue: z.number(),
        totalStockUnits: z.number().int(),
        totalTaxCollected: z.number(),
        totalDiscountGiven: z.number(),
        totalCustomers: z.number().int(),
      }),
    }),
  })
  .openapi('DashboardSummary');

export const RevenuePointSchema = z
  .object({
    date: z.string().openapi({ description: 'ISO date of the bucket start' }),
    label: z.string().openapi({ description: 'Display label, e.g. "Oct 26"' }),
    revenue: z.number(),
    collected: z.number(),
    orders: z.number().int(),
  })
  .openapi('RevenuePoint');