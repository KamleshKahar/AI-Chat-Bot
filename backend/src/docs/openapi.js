import { OpenApiGeneratorV31 } from '@asteasolutions/zod-to-openapi';
import {
  registry,
  z,
  listEnvelope,
  jsonResponse,
  registerRoute,
  DateRangeQuery,
  PagingQuery,
} from '../schemas/common.js';
import {
  UserSchema,
  LoginResponseSchema,
  CompanySchema,
  CategorySchema,
  ProductSchema,
  CustomerSchema,
  SaleSchema,
  InvoiceSchema,
  TransactionSchema,
  DashboardSummarySchema,
  RevenuePointSchema,
} from './responseSchemas.js';
import * as V from '../schemas/validators.js';

/**
 * Builds the OpenAPI 3.1 document from the Zod schemas.
 *
 * The same schema objects validate incoming requests at runtime, so the
 * documentation and the enforcement cannot drift apart.
 */

const BEARER = [{ bearerAuth: [] }];

export function buildOpenApiDocument() {
  // Path registration is not idempotent (registerPath rejects a duplicate
  // method+path), and the spec is static, so build it once and reuse it.
  if (cachedDocument) return cachedDocument;
  cachedDocument = generateDocument();
  return cachedDocument;
}

let cachedDocument = null;

function generateDocument() {
  const listProducts = listEnvelope(ProductSchema);
  const listCustomers = listEnvelope(CustomerSchema);
  const listSales = listEnvelope(SaleSchema);
  const listInvoices = listEnvelope(InvoiceSchema);
  const listTransactions = listEnvelope(TransactionSchema);

  // ---- health -------------------------------------------------------------
  registerRoute({
    method: 'get',
    path: '/api/health',
    tags: ['System'],
    summary: 'Liveness and database connectivity probe',
    security: null,
    responses: {
      200: jsonResponse('Service healthy', z.object({
        status: z.string(),
        database: z.string(),
        timestamp: z.string(),
      })),
    },
  });

  // ---- auth ---------------------------------------------------------------
  registerRoute({
    method: 'post',
    path: '/api/auth/login',
    tags: ['Auth'],
    summary: 'Exchange credentials for a bearer token',
    security: null,
    request: { body: { content: { 'application/json': { schema: V.loginSchema } } } },
    responses: { 200: jsonResponse('Signed in', LoginResponseSchema) },
  });

  registerRoute({
    method: 'get',
    path: '/api/auth/me',
    tags: ['Auth'],
    summary: 'Current authenticated user',
    security: BEARER,
    responses: { 200: jsonResponse('Current user', z.object({ data: UserSchema })) },
  });

  registerRoute({
    method: 'post',
    path: '/api/auth/logout',
    tags: ['Auth'],
    summary: 'Record a logout (stateless JWT — the client discards the token)',
    security: BEARER,
    responses: { 200: jsonResponse('Logged out', z.object({ data: z.object({ success: z.boolean() }) })) },
  });

  registerRoute({
    method: 'post',
    path: '/api/auth/change-password',
    tags: ['Auth'],
    summary: 'Change the signed-in user\'s password',
    security: BEARER,
    request: { body: { content: { 'application/json': { schema: V.changePasswordSchema } } } },
    responses: { 200: jsonResponse('Password changed', z.object({ data: z.object({ success: z.boolean() }) })) },
  });

  // ---- company ------------------------------------------------------------
  registerRoute({
    method: 'get',
    path: '/api/company',
    tags: ['Company'],
    summary: 'Company profile used as the invoice letterhead',
    security: BEARER,
    responses: { 200: jsonResponse('Company profile', z.object({ data: CompanySchema })) },
  });

  registerRoute({
    method: 'put',
    path: '/api/company',
    tags: ['Company'],
    summary: 'Update the company profile (ADMIN only)',
    security: BEARER,
    request: { body: { content: { 'application/json': { schema: V.updateCompanySchema } } } },
    responses: { 200: jsonResponse('Updated profile', z.object({ data: CompanySchema })) },
  });

  // ---- categories ---------------------------------------------------------
  registerRoute({
    method: 'get',
    path: '/api/categories',
    tags: ['Categories'],
    summary: 'List categories',
    description:
      'Returns the complete active set — categories are not paginated, because the product filter dropdowns need all of them. The `meta` block is still present so every list endpoint shares one response shape; `page` is always 1 and `totalPages` always 1.',
    security: BEARER,
    responses: { 200: jsonResponse('Categories', listEnvelope(CategorySchema)) },
  });

  registerRoute({
    method: 'post',
    path: '/api/categories',
    tags: ['Categories'],
    summary: 'Create a category',
    security: BEARER,
    request: { body: { content: { 'application/json': { schema: V.createCategorySchema } } } },
    responses: { 201: jsonResponse('Created', z.object({ data: CategorySchema })) },
  });

  registerRoute({
    method: 'patch',
    path: '/api/categories/{id}',
    tags: ['Categories'],
    summary: 'Update a category',
    security: BEARER,
    request: {
      params: z.object({ id: z.string().openapi({ example: 'CAT-01' }) }),
      body: { content: { 'application/json': { schema: V.updateCategorySchema } } },
    },
    responses: { 200: jsonResponse('Updated', z.object({ data: CategorySchema })) },
  });

  registerRoute({
    method: 'delete',
    path: '/api/categories/{id}',
    tags: ['Categories'],
    summary: 'Soft-delete a category (409 while products still reference it)',
    security: BEARER,
    request: { params: z.object({ id: z.string().openapi({ example: 'CAT-01' }) }) },
    responses: {
      200: jsonResponse(
        'Deleted',
        z.object({ data: z.object({ id: z.string(), deleted: z.boolean() }) })
      ),
    },
  });

  // ---- products -----------------------------------------------------------
  registerRoute({
    method: 'get',
    path: '/api/products',
    tags: ['Products'],
    summary: 'Paginated product list with server-side search, filtering and sorting',
    description:
      '`status` filtering and sorting are evaluated in SQL using the derived stock-status expression, so paging stays correct.',
    security: BEARER,
    request: { query: z.object({ ...V.productListQuerySchema.shape, ...PagingQuery.shape }) },
    responses: {
      200: jsonResponse('Products', listProducts.extend({
        counts: z.object({
          all: z.number().int(),
          in_stock: z.number().int(),
          low_stock: z.number().int(),
          out_of_stock: z.number().int(),
        }),
      })),
    },
  });

  registerRoute({
    method: 'get',
    path: '/api/products/{id}',
    tags: ['Products'],
    summary: 'Product detail with sales performance and recent stock movements',
    security: BEARER,
    request: {
      params: z.object({ id: z.string().openapi({ example: 'PRD-101' }) }),
      query: DateRangeQuery,
    },
    responses: { 200: jsonResponse('Product detail', z.object({ data: z.any() })) },
  });

  registerRoute({
    method: 'post',
    path: '/api/products',
    tags: ['Products'],
    summary: 'Create a product (accepts category code or name)',
    security: BEARER,
    request: { body: { content: { 'application/json': { schema: V.createProductSchema } } } },
    responses: { 201: jsonResponse('Created', z.object({ data: ProductSchema })) },
  });

  registerRoute({
    method: 'put',
    path: '/api/products/{id}',
    tags: ['Products'],
    summary: 'Update product details (stock is not writable here — use a stock adjustment)',
    security: BEARER,
    request: {
      params: z.object({ id: z.string().openapi({ example: 'PRD-101' }) }),
      body: { content: { 'application/json': { schema: V.updateProductSchema } } },
    },
    responses: { 200: jsonResponse('Updated', z.object({ data: ProductSchema })) },
  });

  registerRoute({
    method: 'delete',
    path: '/api/products/{id}',
    tags: ['Products'],
    summary: 'Soft-delete a product (ADMIN only)',
    security: BEARER,
    request: { params: z.object({ id: z.string().openapi({ example: 'PRD-101' }) }) },
    responses: {
      200: jsonResponse(
        'Deleted',
        z.object({ data: z.object({ id: z.string(), deleted: z.boolean() }) })
      ),
    },
  });

  registerRoute({
    method: 'post',
    path: '/api/products/{id}/stock-adjustments',
    tags: ['Products'],
    summary: 'Adjust stock atomically, writing a movement and a ledger entry',
    security: BEARER,
    request: {
      params: z.object({ id: z.string().openapi({ example: 'PRD-101' }) }),
      body: { content: { 'application/json': { schema: V.stockAdjustmentSchema } } },
    },
    responses: { 201: jsonResponse('Adjusted', z.object({ data: z.any() })) },
  });

  // ---- customers ----------------------------------------------------------
  registerRoute({
    method: 'get',
    path: '/api/customers',
    tags: ['Customers'],
    summary: 'Paginated customer list',
    description:
      '`totalPurchases`, `outstandingBalance` and `ordersCount` are computed by a SQL aggregate over live invoices — they are not cached columns.',
    security: BEARER,
    request: { query: z.object({ ...V.customerListQuerySchema.shape, ...PagingQuery.shape }) },
    responses: { 200: jsonResponse('Customers', listCustomers) },
  });

  registerRoute({
    method: 'get',
    path: '/api/customers/{id}',
    tags: ['Customers'],
    summary: 'Customer detail with purchase history',
    security: BEARER,
    request: { params: z.object({ id: z.string().openapi({ example: 'CUST-001' }) }) },
    responses: { 200: jsonResponse('Customer detail', z.object({ data: z.any() })) },
  });

  registerRoute({
    method: 'post',
    path: '/api/customers',
    tags: ['Customers'],
    summary: 'Create a customer',
    security: BEARER,
    request: { body: { content: { 'application/json': { schema: V.createCustomerSchema } } } },
    responses: { 201: jsonResponse('Created', z.object({ data: CustomerSchema })) },
  });

  registerRoute({
    method: 'put',
    path: '/api/customers/{id}',
    tags: ['Customers'],
    summary: 'Update a customer',
    security: BEARER,
    request: {
      params: z.object({ id: z.string().openapi({ example: 'CUST-001' }) }),
      body: { content: { 'application/json': { schema: V.updateCustomerSchema } } },
    },
    responses: { 200: jsonResponse('Updated', z.object({ data: CustomerSchema })) },
  });

  registerRoute({
    method: 'delete',
    path: '/api/customers/{id}',
    tags: ['Customers'],
    summary: 'Soft-delete a customer',
    security: BEARER,
    request: { params: z.object({ id: z.string().openapi({ example: 'CUST-001' }) }) },
    responses: {
      200: jsonResponse(
        'Deleted',
        z.object({ data: z.object({ id: z.string(), deleted: z.boolean() }) })
      ),
    },
  });

  // ---- sales --------------------------------------------------------------
  registerRoute({
    method: 'get',
    path: '/api/sales',
    tags: ['Sales'],
    summary: 'Paginated POS-oriented sale list',
    description:
      'Backed by the same `invoices` table as `/api/invoices`, projected into the shape the Sales screen renders.',
    security: BEARER,
    request: { query: z.object({ ...V.saleListQuerySchema.shape, ...PagingQuery.shape }) },
    responses: { 200: jsonResponse('Sales', listSales) },
  });

  registerRoute({
    method: 'get',
    path: '/api/sales/{id}',
    tags: ['Sales'],
    summary: 'One sale by sale code, invoice number or id',
    security: BEARER,
    request: { params: z.object({ id: z.string().openapi({ example: 'SALE-1001' }) }) },
    responses: { 200: jsonResponse('Sale', z.object({ data: SaleSchema })) },
  });

  registerRoute({
    method: 'post',
    path: '/api/sales',
    tags: ['Sales'],
    summary: 'Create a sale (single transaction: stock, invoice, payment, ledger)',
    description:
      'Client-supplied `subtotal`, `taxAmount`, `discountAmount` and `grandTotal` are ignored — the server recomputes every figure from the catalogue. Returns 409 if any line exceeds available stock.',
    security: BEARER,
    request: { body: { content: { 'application/json': { schema: V.createSaleSchema } } } },
    responses: {
      201: jsonResponse('Sale created', z.object({ data: z.object({ sale: SaleSchema, invoice: InvoiceSchema }) })),
    },
  });

  // ---- invoices -----------------------------------------------------------
  registerRoute({
    method: 'get',
    path: '/api/invoices',
    tags: ['Invoices'],
    summary: 'Paginated invoice list',
    security: BEARER,
    request: { query: z.object({ ...V.invoiceListQuerySchema.shape, ...PagingQuery.shape }) },
    responses: { 200: jsonResponse('Invoices', listInvoices) },
  });

  registerRoute({
    method: 'get',
    path: '/api/invoices/{id}',
    tags: ['Invoices'],
    summary: 'Invoice detail with payments (prints straight from this payload)',
    security: BEARER,
    request: { params: z.object({ id: z.string().openapi({ example: 'INV-2026-001' }) }) },
    responses: { 200: jsonResponse('Invoice', z.object({ data: InvoiceSchema })) },
  });

  registerRoute({
    method: 'post',
    path: '/api/invoices/{id}/payments',
    tags: ['Invoices'],
    summary: 'Record a payment against an invoice',
    description: 'Rejects with 422 if the amount exceeds the outstanding balance.',
    security: BEARER,
    request: {
      params: z.object({ id: z.string().openapi({ example: 'INV-2026-001' }) }),
      body: { content: { 'application/json': { schema: V.recordPaymentSchema } } },
    },
    responses: { 201: jsonResponse('Payment recorded', z.object({ data: InvoiceSchema })) },
  });

  registerRoute({
    method: 'delete',
    path: '/api/invoices/{id}',
    tags: ['Invoices'],
    summary: 'Cancel an invoice (soft delete)',
    security: BEARER,
    request: { params: z.object({ id: z.string().openapi({ example: 'INV-2026-001' }) }) },
    responses: { 200: jsonResponse('Cancelled', z.object({ id: z.string(), deleted: z.boolean() })) },
  });

  // ---- dashboard ----------------------------------------------------------
  registerRoute({
    method: 'get',
    path: '/api/dashboard/summary',
    tags: ['Dashboard'],
    summary: 'Headline metrics for the dashboard StatCards',
    security: BEARER,
    responses: { 200: jsonResponse('Metrics', DashboardSummarySchema) },
  });

  registerRoute({
    method: 'get',
    path: '/api/dashboard/alerts',
    tags: ['Dashboard'],
    summary: 'Low and out of stock products for the header bell',
    security: BEARER,
    request: { query: z.object({ limit: z.coerce.number().int().min(1).max(100).optional() }) },
    responses: { 200: jsonResponse('Alerts', z.object({ data: z.any() })) },
  });

  registerRoute({
    method: 'get',
    path: '/api/dashboard/transactions',
    tags: ['Dashboard'],
    summary: 'Most recent ledger entries',
    security: BEARER,
    request: { query: z.object({ limit: z.coerce.number().int().min(1).max(100).optional() }) },
    responses: { 200: jsonResponse('Transactions', z.object({ data: z.array(TransactionSchema) })) },
  });

  // ---- ledger -------------------------------------------------------------
  registerRoute({
    method: 'get',
    path: '/api/ledger',
    tags: ['Ledger'],
    summary: 'Paginated cash ledger (structured replacement for `transactions`)',
    security: BEARER,
    request: { query: z.object({ ...V.ledgerListQuerySchema.shape, ...PagingQuery.shape }) },
    responses: { 200: jsonResponse('Ledger entries', listTransactions) },
  });

  // ---- reports ------------------------------------------------------------
  const reportRange = z.object({ ...DateRangeQuery.shape, granularity: z.enum(['day', 'week', 'month']).optional() });

  registerRoute({
    method: 'get',
    path: '/api/reports/sales-summary',
    tags: ['Reports'],
    summary: 'Sales totals for a window, with the previous window for comparison',
    security: BEARER,
    request: { query: DateRangeQuery },
    responses: { 200: jsonResponse('Summary', z.object({ data: z.any() })) },
  });

  registerRoute({
    method: 'get',
    path: '/api/reports/revenue-trend',
    tags: ['Reports'],
    summary: 'Revenue over time, zero-filled so quiet days are not omitted',
    security: BEARER,
    request: { query: reportRange },
    responses: { 200: jsonResponse('Series', z.object({ data: z.array(RevenuePointSchema) })) },
  });

  registerRoute({
    method: 'get',
    path: '/api/reports/payment-breakdown',
    tags: ['Reports'],
    summary: 'Collected amount split by payment method',
    security: BEARER,
    request: { query: DateRangeQuery },
    responses: { 200: jsonResponse('Breakdown', z.object({ data: z.any() })) },
  });

  registerRoute({
    method: 'get',
    path: '/api/reports/product-performance',
    tags: ['Reports'],
    summary: 'Units sold, revenue, profit and margin per product',
    security: BEARER,
    request: { query: DateRangeQuery },
    responses: { 200: jsonResponse('Performance', z.object({ data: z.any() })) },
  });

  registerRoute({
    method: 'get',
    path: '/api/reports/inventory-valuation',
    tags: ['Reports'],
    summary: 'Stock value at cost and retail, overall and per category',
    security: BEARER,
    responses: { 200: jsonResponse('Valuation', z.object({ data: z.any() })) },
  });

  registerRoute({
    method: 'get',
    path: '/api/reports/customer-performance',
    tags: ['Reports'],
    summary: 'Lifetime value, collection and average order per customer',
    security: BEARER,
    request: { query: DateRangeQuery },
    responses: { 200: jsonResponse('Performance', z.object({ data: z.any() })) },
  });

  registerRoute({
    method: 'get',
    path: '/api/reports/cash-flow',
    tags: ['Reports'],
    summary: 'Cash in, cash out and net for a window',
    security: BEARER,
    request: { query: DateRangeQuery },
    responses: { 200: jsonResponse('Cash flow', z.object({ data: z.any() })) },
  });

  registerRoute({
    method: 'get',
    path: '/api/reports/receivables-aging',
    tags: ['Reports'],
    summary: 'Outstanding amounts bucketed by how late they are',
    security: BEARER,
    responses: { 200: jsonResponse('Aging', z.object({ data: z.any() })) },
  });

  const generator = new OpenApiGeneratorV31(registry.definitions);

  return generator.generateDocument({
    openapi: '3.1.0',
    info: {
      title: 'FlowPilot Sales & Inventory API',
      version: '1.0.0',
      description: [
        'REST API backing the FlowPilot Next.js dashboard.',
        '',
        '### Conventions',
        '- **Identifiers** are human-readable document codes (`PRD-101`, `CUST-001`, `INV-2026-009`), returned in the `id` field.',
        '- **Money** is a JSON number in rupees, always `DECIMAL(14,2)` server-side and rounded half-up.',
        '- **Lists** return `{ data: [...], meta: { total, page, limit, totalPages } }`. No endpoint returns an unbounded collection.',
        '- **Errors** return `{ error: { status, code, message, details? } }`.',
        '',
        '### Derived state',
        '- Product `status` is derived from `stockQuantity` vs `minStockLevel` and is never stored.',
        '- Invoice `paymentStatus` of `Overdue` is derived from `dueDate` vs today and is never stored.',
        '',
        '### GST',
        'Intra-state invoices are split into CGST + SGST; inter-state invoices carry IGST at the full rate.',
      ].join('\n'),
    },
    servers: [{ url: 'http://localhost:4000', description: 'Local development' }],
    security: BEARER,
    tags: [
      { name: 'System', description: 'Health and diagnostics' },
      { name: 'Auth', description: 'Sign in and password management' },
      { name: 'Company', description: 'Invoice letterhead and banking details' },
      { name: 'Categories', description: 'Product categories' },
      { name: 'Products', description: 'Catalogue and stock' },
      { name: 'Customers', description: 'Customer records' },
      { name: 'Sales', description: 'Point-of-sale transactions' },
      { name: 'Invoices', description: 'Invoice documents and payments' },
      { name: 'Dashboard', description: 'Dashboard aggregates' },
      { name: 'Ledger', description: 'Cash movement history' },
      { name: 'Reports', description: 'Aggregated reporting' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      },
    },
  });
}