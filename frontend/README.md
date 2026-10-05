# FlowPilot Sales & Inventory — Frontend

A complete, production-style frontend for a sales, inventory and invoicing platform built for
Indian retail and distribution businesses (INR / GST).

Built with **Next.js 16 (App Router)**, **React 19**, **JavaScript**, **Tailwind CSS v4** and
**Lucide React**. No backend is required — all data is mocked and persisted to `localStorage`.

---

## Getting started

```bash
cd frontend
npm install
npm run dev        # http://localhost:3000
npm run build      # production build
npm run verify     # billing-math sanity checks + import/export resolution check
```

### Demo credentials

| Field    | Value                |
| -------- | -------------------- |
| Email    | `admin@flowpilot.in` |
| Password | `flowpilot123`       |

Both are shown on the login page with an **Auto-fill** button. Authentication is a client-side
comparison against these constants — no network calls.

---

## Modules

| Route          | Module    | Capabilities                                                                          |
| -------------- | --------- | ------------------------------------------------------------------------------------- |
| `/dashboard`   | Dashboard | KPI cards, real-data sales chart, recent transactions, low-stock alerts, quick actions |
| `/customers`   | Customers | List, search, filter, create/edit/delete, detail view, purchase history, dues         |
| `/inventory`   | Inventory | Product CRUD, SKU/category filters, stock adjustment, low/out-of-stock states         |
| `/sales`       | Sales     | Transaction list + full POS-style sale builder with live totals and discount logic      |
| `/invoices`    | Invoicing | Invoice list, payment recording, printable GST invoice layout                          |
| `/invoices/[id]` | Invoice | Full invoice detail with print-optimised A4 output                                     |
| `/reports`     | Reports   | Sales, revenue, product, inventory and customer reports with date filters and charts    |
| `/login`       | Auth      | Dummy login, protected routes, logout                                                 |

Deep links are supported: `/sales?action=new`, `/inventory?action=add`, `/customers?action=add`,
`/inventory?adjust=PRD-101`, `/inventory?filter=low_stock`.

---

## Architecture

```text
frontend/
├── app/
│   ├── (auth)/login/page.js          # Public login screen
│   ├── (dashboard)/                  # Auth-protected shell (sidebar + topbar)
│   │   ├── layout.js
│   │   ├── loading.js                # Route transition state
│   │   ├── error.js                  # Error boundary with retry
│   │   ├── dashboard/page.js
│   │   ├── customers/page.js
│   │   ├── inventory/page.js
│   │   ├── sales/page.js
│   │   ├── invoices/page.js
│   │   ├── invoices/[id]/page.js
│   │   └── reports/page.js
│   ├── layout.js                     # Root: providers + fonts + metadata
│   ├── page.js                       # "/" -> redirects to /dashboard
│   ├── not-found.js                  # 404
│   └── globals.css                   # Tailwind + print stylesheet
├── components/
│   ├── layout/                       # Sidebar, Header, DashboardLayoutWrapper
│   ├── ui/                           # Button, Input, Select, Modal, FormModal, DataTable,
│   │                                 # Badge, Card, SearchInput, PageHeader, StateFeedback,
│   │                                 # ConfirmDialog
│   ├── dashboard/                    # OverviewCard, SalesChart, LowStockAlert, ...
│   ├── customers/                    # CustomerFormModal, CustomerDetailModal
│   ├── inventory/                    # ProductFormModal, ProductDetailModal, StockAdjustmentModal
│   ├── sales/                        # CreateSaleForm, SaleDetailModal
│   ├── invoices/                     # PrintableInvoice, RecordPaymentModal
│   └── reports/                      # Dependency-free SVG charts
├── context/
│   ├── AuthContext.js                # Session + dummy credential validation
│   ├── DataContext.js                # Single source of truth for all entities + CRUD
│   └── ToastContext.js               # Toast notifications
├── data/mock/initialData.js          # All seed data (customers, products, sales, ...)
├── lib/
│   ├── formatters.js                 # Currency / date / number helpers (en-IN, ₹)
│   ├── salesLogic.js                 # Pure business logic (totals, reports aggregations)
│   └── storage.js                    # SSR-safe localStorage wrapper
└── scripts/
    ├── verify.mjs                    # Billing math assertions
    └── check-imports.mjs             # Import + named-export resolution check
```

### Design decisions

- **Business logic is separated from presentation.** All money maths lives in `lib/salesLogic.js`
  (`calculateSaleTotals`, `resolvePaymentStatus`, report aggregations). Components only render.
- **Mock data is isolated** in `data/mock/initialData.js`. Swapping in a real API means replacing
  the function bodies in `DataContext.js` — no component changes required.
- **Persistence** is handled by `DataContext`, which hydrates from `localStorage` on mount and
  writes back on every change. IDs are generated sequentially (`SALE-1009`, `INV-2026-009`) so they
  never collide.
- **Single owner of state.** Every mutation (product, customer, category, sale, payment,
  adjustment) goes through `DataContext`, which keeps derived metrics and cross-entity side effects
  (stock deduction, customer balances, transaction log) consistent.
- **Charts are hand-rolled SVG** — no chart library dependency.

### Calculations

```
lineAmount     = quantity × unitPrice
subtotal       = Σ lineAmount
discountAmount = percent → subtotal × pct/100   |   flat → min(value, subtotal)
taxableAmount  = subtotal − discountAmount
taxAmount      = taxableAmount × taxRate/100
grandTotal     = taxableAmount + taxAmount + shipping
```

All values are rounded to 2 decimals to avoid floating-point drift (`round2`).

---

## Features

**Inventory**
- SKU, MRP, selling price, cost price, tax rate, unit and reorder level per product
- Stock status derived automatically: `out_of_stock` (0), `low_stock` (≤ reorder level), `in_stock`
- Stock In / Stock Out adjustments with reason, notes, live preview and transaction log entry
- Automatic selling-price suggestion from MRP, and a live margin preview while editing
- Validation blocks selling price > MRP and cost price > selling price

**Sales**
- POS-style line-item builder with stock availability warnings and hard validation
- Percent or flat discounts, shipping charges, tax computed from the product GST rate
- Payment modes: full, partial or on-credit, with live balance-due and status preview
- Saving a sale deducts stock, updates customer lifetime value and balances, and generates the invoice

**Invoicing**
- A4 print layout with company header, party blocks, CGST/SGST split, amount in words
  (Indian numbering: crore/lakh/thousand), bank details, terms and signature block
- Print stylesheet in `globals.css` strips all app chrome so only the invoice prints
- Record-payment modal with quick-amount buttons; reduces the customer's outstanding balance

**Reports**
- Date range with presets, and day/week/month grouping granularity
- Revenue trend (zero-filled for daily view), collection breakdown, payment-method donut
- Product performance (units, revenue, profit, margin), category revenue mix
- Inventory valuation at cost and retail value by category
- Customer lifetime value, average order value, collection and receivables

---

## Notes

- The header profile menu exposes **Reset Demo Data** to restore the original sample dataset.
- All dates in the seed data are relative to the demo window (Sep–Oct 2026) so charts and reports
  have meaningful data out of the box.
- `npm run verify` runs the billing assertions and validates that every `@/…` import and named
  export in the project resolves.