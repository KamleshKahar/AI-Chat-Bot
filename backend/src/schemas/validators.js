import { z } from './common.js';

/**
 * Validation schemas.
 *
 * These mirror frontend/components/**\/*.js form rules exactly, so the server
 * rejects precisely what the UI would have rejected — and returns a field-keyed
 * `details` object the forms can map straight onto their existing error state.
 */

const trimmed = (max, message) => z.string().trim().min(1, message).max(max);

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email('Enter a valid email address')
  .max(160, 'Email must be 160 characters or fewer');

export const pincodeSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, 'PIN code must be exactly 6 digits');

export const gstinSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[0-9A-Z]{15}$/, 'GSTIN must be exactly 15 letters and digits');

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required').max(200),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z
    .string()
    .min(8, 'New password must be at least 8 characters')
    .max(200),
});

// ---------------------------------------------------------------------------
// Company profile
// ---------------------------------------------------------------------------

export const updateCompanySchema = z
  .object({
    name: trimmed(160, 'Company name is required').optional(),
    tagline: z.string().trim().max(255).nullish(),
    gstin: gstinSchema.nullish(),
    pan: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[0-9A-Z]{10}$/, 'PAN must be exactly 10 letters and digits')
      .nullish(),
    email: emailSchema.nullish(),
    phone: z.string().trim().max(40).nullish(),
    address: z.string().trim().max(255).nullish(),
    city: z.string().trim().max(80).nullish(),
    state: z.string().trim().max(80).nullish(),
    pincode: pincodeSchema.nullish(),
    bankName: z.string().trim().max(120).nullish(),
    bankAccount: z.string().trim().max(40).nullish(),
    ifscCode: z.string().trim().max(20).nullish(),
    upiId: z.string().trim().max(120).nullish(),
    invoicePrefix: z.string().trim().min(1).max(10).optional(),
    invoiceTerms: z.string().trim().max(5000).nullish(),
    paymentTermDays: z.coerce.number().int().min(0).max(365).optional(),
    financialYearFrom: z.coerce.number().int().min(1).max(12).optional(),
    logoUrl: z.string().trim().max(255).nullish(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'Provide at least one field to update',
  });

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export const createCategorySchema = z.object({
  name: trimmed(120, 'Category name is required'),
  code: z.string().trim().max(20).nullish(),
  shortCode: z.string().trim().max(20).nullish(),
  description: z.string().trim().max(255).nullish(),
  isActive: z.coerce.boolean().optional(),
});

export const updateCategorySchema = createCategorySchema.partial().refine(
  (v) => Object.keys(v).length > 0,
  { message: 'Provide at least one field to update' }
);

export const categoryIdParam = z.object({ id: z.string().trim().min(1) });

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

const money2 = z.coerce.number().min(0, 'Must be zero or greater').max(9_999_999_999.99);

export const createProductSchema = z
  .object({
    name: trimmed(255, 'Product name is required'),
    sku: trimmed(40, 'SKU is required').max(40),
    // Accepts either the category code (CAT-01) or its name; resolved server-side.
    category: z.string().trim().min(1, 'Please select a category'),
    description: z.string().trim().max(2000).nullish(),
    unit: z.string().trim().max(20).default('pcs'),
    hsnCode: z.string().trim().max(12).nullish(),
    mrp: money2.refine((v) => v > 0, { message: 'MRP must be greater than 0' }),
    sellingPrice: money2.refine((v) => v > 0, { message: 'Selling price must be greater than 0' }),
    costPrice: money2.refine((v) => v > 0, { message: 'Cost price must be greater than 0' }),
    taxRate: z.coerce.number().min(0).max(100).default(18),
    stockQuantity: z.coerce.number().int().min(0, 'Stock cannot be negative').default(0),
    minStockLevel: z.coerce.number().int().min(0, 'Reorder level cannot be negative').default(10),
    isActive: z.coerce.boolean().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.sellingPrice > v.mrp) {
      ctx.addIssue({
        code: 'custom',
        path: ['sellingPrice'],
        message: 'Selling price cannot exceed MRP',
      });
    }
    if (v.costPrice > v.sellingPrice) {
      ctx.addIssue({
        code: 'custom',
        path: ['costPrice'],
        message: 'Cost price cannot exceed selling price',
      });
    }
  });

export const updateProductSchema = z
  .object({
    name: trimmed(255, 'Product name is required').optional(),
    sku: trimmed(40, 'SKU is required').max(40).optional(),
    category: z.string().trim().min(1, 'Please select a category').optional(),
    description: z.string().trim().max(2000).nullish(),
    unit: z.string().trim().max(20).optional(),
    hsnCode: z.string().trim().max(12).nullish(),
    mrp: money2.refine((v) => v > 0, { message: 'MRP must be greater than 0' }).optional(),
    sellingPrice: money2.refine((v) => v > 0, { message: 'Selling price must be greater than 0' }).optional(),
    costPrice: money2.refine((v) => v > 0, { message: 'Cost price must be greater than 0' }).optional(),
    taxRate: z.coerce.number().min(0).max(100).optional(),
    // Direct stock writes are intentionally NOT accepted here: stock only ever
    // moves through POST /api/products/:id/stock-adjustments so that every change
    // leaves a stock_movements audit row.
    minStockLevel: z.coerce.number().int().min(0).optional(),
    isActive: z.coerce.boolean().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.mrp !== undefined && v.sellingPrice !== undefined && v.sellingPrice > v.mrp) {
      ctx.addIssue({ code: 'custom', path: ['sellingPrice'], message: 'Selling price cannot exceed MRP' });
    }
    if (v.sellingPrice !== undefined && v.costPrice !== undefined && v.costPrice > v.sellingPrice) {
      ctx.addIssue({ code: 'custom', path: ['costPrice'], message: 'Cost price cannot exceed selling price' });
    }
    if (Object.keys(v).length === 0) {
      ctx.addIssue({ code: 'custom', path: [], message: 'Provide at least one field to update' });
    }
  });

export const stockAdjustmentSchema = z.object({
  mode: z.enum(['add', 'remove'], { message: "Mode must be 'add' or 'remove'" }),
  quantity: z.coerce
    .number()
    .int()
    .positive('Quantity must be greater than 0'),
  reason: trimmed(120, 'Reason is required').optional(),
  notes: z.string().trim().max(255).nullish(),
});

export const productListQuerySchema = z.object({
  search: z.string().trim().optional(),
  category: z.string().trim().optional(),
  status: z.enum(['in_stock', 'low_stock', 'out_of_stock']).optional(),
  sort: z.enum(['name', 'stock_asc', 'stock_desc', 'value', 'price', 'newest']).default('name'),
  order: z.enum(['asc', 'desc']).default('asc'),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const productDetailStatsQuery = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------

export const createCustomerSchema = z.object({
  name: trimmed(160, 'Contact name is required'),
  company: z.string().trim().max(160).nullish(),
  email: emailSchema,
  phone: trimmed(40, 'Phone number is required'),
  address: z.string().trim().max(255).nullish(),
  city: z.string().trim().max(80).nullish(),
  state: z.string().trim().max(80).nullish(),
  pincode: pincodeSchema.optional().or(z.literal('')),
  gstin: gstinSchema.optional().or(z.literal('')),
  creditLimit: z.coerce.number().min(0).default(0),
  // Matches the frontend form's optional opening-balance field.
  outstandingBalance: z.coerce.number().min(0).default(0),
  status: z.enum(['active', 'inactive']).default('active'),
});

export const updateCustomerSchema = createCustomerSchema
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'Provide at least one field to update' });

export const customerListQuerySchema = z.object({
  search: z.string().trim().optional(),
  status: z.enum(['active', 'inactive']).optional(),
  balance: z.enum(['has_dues', 'clear']).optional(),
  sort: z.enum(['name', 'value', 'outstanding', 'orders', 'recent']).default('name'),
  order: z.enum(['asc', 'desc']).default('asc'),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

// ---------------------------------------------------------------------------
// Sales
// ---------------------------------------------------------------------------

export const saleItemSchema = z.object({
  productId: z.string().trim().min(1, 'Product is required'),
  quantity: z.coerce.number().int().positive('Quantity must be greater than 0'),
  // Optional: the server re-reads the authoritative price from the catalogue.
  unitPrice: z.coerce.number().min(0).optional(),
});

export const createSaleSchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be a valid YYYY-MM-DD date').optional(),
    customerId: z.string().trim().min(1, 'Please select a customer'),
    items: z.array(saleItemSchema).min(1, 'Add at least one product to the sale'),
    discountType: z.enum(['percent', 'flat']).default('percent'),
    discountValue: z.coerce.number().min(0).default(0),
    taxRate: z.coerce.number().min(0).max(100).default(18),
    shippingCharges: z.coerce.number().min(0).default(0),
    // 'full' pays the invoice in full; 'partial' uses paymentAmount.
    paymentMode: z.enum(['full', 'partial', 'none']).default('full'),
    paymentAmount: z.coerce.number().min(0).default(0),
    paymentMethod: z
      .enum(['UPI', 'Cash', 'Bank Transfer', 'Cheque', 'Credit Card', 'COD'])
      .default('UPI'),
    notes: z.string().trim().max(1000).nullish(),
  })
  .superRefine((v, ctx) => {
    if (v.discountType === 'percent' && v.discountValue > 100) {
      ctx.addIssue({ code: 'custom', path: ['discountValue'], message: 'Discount cannot exceed 100%' });
    }
    if (v.paymentMode === 'partial' && v.paymentAmount <= 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['paymentAmount'],
        message: 'Enter an amount greater than 0 for a partial payment',
      });
    }
  });

export const saleListQuerySchema = z.object({
  search: z.string().trim().optional(),
  paymentStatus: z
    .enum(['Pending', 'Partial', 'Paid', 'Overdue'])
    .optional(),
  paymentMethod: z.string().trim().optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  sort: z.enum(['date', 'amount', 'customer']).default('date'),
  order: z.enum(['asc', 'desc']).default('desc'),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

// ---------------------------------------------------------------------------
// Invoices & payments
// ---------------------------------------------------------------------------

export const invoiceListQuerySchema = z.object({
  search: z.string().trim().optional(),
  paymentStatus: z.enum(['Pending', 'Partial', 'Paid', 'Overdue']).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  sort: z.enum(['date', 'due', 'amount', 'balance']).default('date'),
  order: z.enum(['asc', 'desc']).default('desc'),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const recordPaymentSchema = z.object({
  amount: z.coerce.number().positive('Amount must be greater than 0'),
  paymentMethod: z
    .enum(['UPI', 'Cash', 'Bank Transfer', 'Cheque', 'Credit Card', 'COD'])
    .default('UPI'),
  reference: z.string().trim().max(80).nullish(),
  notes: z.string().trim().max(255).nullish(),
});

export const idParam = z.object({ id: z.string().trim().min(1) });

// ---------------------------------------------------------------------------
// Ledger
// ---------------------------------------------------------------------------

export const ledgerListQuerySchema = z.object({
  search: z.string().trim().optional(),
  type: z.string().trim().optional(),
  direction: z.enum(['IN', 'OUT']).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  sort: z.enum(['date', 'amount']).default('date'),
  order: z.enum(['asc', 'desc']).default('desc'),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const limitQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

export const reportQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  granularity: z.enum(['day', 'week', 'month']).default('day'),
});

export const reportPagedQuerySchema = reportQuerySchema.extend({
  sort: z.enum(['revenue', 'profit', 'units', 'name', 'value']).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
  page: z.coerce.number().int().min(1).optional(),
});