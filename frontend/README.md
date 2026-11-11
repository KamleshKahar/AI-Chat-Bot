# FlowPilot Sales & Inventory — Frontend

A complete, production-style frontend for a sales, inventory and invoicing platform built for
Indian retail and distribution businesses (INR / GST).

Built with **Next.js 16 (App Router)**, **React 19**, **JavaScript**, **Tailwind CSS v4** and
**Lucide React**. All data is server-owned: the Next.js BFF proxies `/api/*` to the REST backend,
and every list is filtered, sorted and paginated in SQL.

---

## Getting started

```bash
cd frontend
npm install
npm run dev        # http://localhost:3000 (3100 here, since ai-backend holds 3000)
npm run build      # production build
npm run verify     # billing-math sanity checks + import/export resolution check
```

### First run

There are no seeded accounts. With an empty database, `/login` redirects to **`/setup`**, a
two-step wizard that creates the first **administrator** account (and optionally the company
letterhead printed on invoices). The backend only accepts this while the `users` table is empty,
so the wizard cannot be replayed to mint extra admins. Afterwards, that administrator invites the
rest of the team from **Users**.

Authentication is a session cookie (`flowpilot_token`, httpOnly) set by the BFF route handlers in
`app/api/auth/*`; client JavaScript never sees the JWT.

---

## Modules

| Route            | Module    | Capabilities                                                                          |
| ---------------- | --------- | ------------------------------------------------------------------------------------- |
| `/dashboard`     | Dashboard | KPI cards, real-data sales chart, recent transactions, low-stock alerts, quick actions |
| `/customers`     | Customers | List, search, filter, create/edit/delete, detail view, purchase history, dues         |
| `/inventory`     | Inventory | Product CRUD, SKU/category filters, stock adjustment, low/out-of-stock states         |
| `/sales`         | Sales     | Transaction list + full POS-style sale builder with live totals and discount logic      |
| `/invoices`      | Invoicing | Invoice list, payment recording, printable GST invoice layout                          |
| `/invoices/[id]` | Invoice   | Full invoice detail with print-optimised A4 output                                     |
| `/reports`       | Reports   | Sales, revenue, product, inventory and customer reports with date filters and charts    |
| `/users`         | Users     | ADMIN-only account management: create, edit role, reset password, deactivate            |
| `/chat`          | AI        | AI assistant, proxied with the caller's own session token                               |
| `/setup`         | Auth      | First-run wizard (only while no accounts exist)                                         |
| `/login`         | Auth      | Sign-in, session restore, logout                                                        |

Deep links are supported: `/sales?action=new`, `/inventory?action=add`, `/customers?action=add`,
`/inventory?adjust=PRD-101`, `/inventory?filter=low_stock`.

### Roles & permissions

The permission matrix lives in **one place** — `backend/src/middleware/roles.js` — and arrives on
`/auth/me` as the user's `permissions` array. The sidebar, the "New Sale" button and the
`/users` & `/reports` pages gate themselves with `can(permission)` from `AuthContext`; the backend
re-checks every request, so a hidden control is a rendering choice, never the security boundary.

| Role | Can |
| --- | --- |
| ADMIN | everything, including user administration and product deletion |
| MANAGER | catalogue, customers, sales, payments, reports |
| CASHIER | ring up sales, adjust stock, read catalogue |
| VIEWER | read-only, no reports |

Accounts are **deactivated, never deleted** — every sale, payment and audit row references a real
person. An administrator cannot change their own role or status, and the last active
administrator can never be demoted or deactivated.

---

## Architecture

```text
frontend/
├── app/
│   ├── (auth)/login/page.js          # Sign-in (redirects to /setup on first run)
│   ├── (auth)/setup/page.js          # First-run wizard
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
│   │   ├── reports/page.js           # Gated on report:read
│   │   ├── users/page.js             # Gated on user:read
│   │   └── chat/page.js
│   ├── api/auth/{login,logout,setup}/route.js   # BFF: token → httpOnly cookie
│   ├── layout.js                     # Root: providers + fonts + metadata
│   ├── page.js                       # "/" -> redirects to /dashboard
│   ├── not-found.js                  # 404
│   └── globals.css                   # Tailwind + print stylesheet
├── components/
│   ├── layout/                       # Sidebar (permission-filtered), Header
│   ├── auth/RequirePermission.js     # Client-side page gate (clear 403 UX)
│   ├── ui/                           # Button, Input, Select, Modal, FormModal, DataTable,
│   │                                 # Badge, Card, SearchInput, PageHeader, StateFeedback,
│   │                                 # ConfirmDialog
│   ├── dashboard/                    # OverviewCard, SalesChart, LowStockAlert, ...
│   ├── customers/                    # CustomerFormModal, CustomerDetailModal
│   ├── inventory/                    # ProductFormModal, ProductDetailModal, StockAdjustmentModal
│   ├── sales/                        # CreateSaleForm, SaleDetailModal
│   ├── invoices/                     # PrintableInvoice, RecordPaymentModal
│   ├── users/                        # UserFormModal, ResetPasswordModal, ChangePasswordModal
│   └── reports/                      # Dependency-free SVG charts
├── context/
│   ├── AuthContext.js                # /auth/me session state + permissions + can()
│   ├── DataContext.js                # Mutations; bumps `revision` to refresh queries
│   └── ToastContext.js               # Toast notifications
├── hooks/
│   └── useServerQuery.js             # useServerList / useServerResource / useDebouncedValue
├── lib/
│   ├── apiClient.js                  # The one module that knows the { data, meta } envelope
│   ├── session.js                    # Cookie name, PUBLIC_PATHS, cookie options
│   ├── formatters.js                 # Currency / date / number helpers (en-IN, ₹)
│   ├── salesLogic.js                 # Pure billing maths (pinned by scripts/verify.mjs)
│   ├── aiClient.js, chatStore.js     # AI assistant client + local chat history
│   └── storage.js                    # SSR-safe localStorage wrapper
├── proxy.js                          # Session guard + /api rewrite to the backend
└── scripts/
    ├── verify.mjs                    # Billing math assertions
    └── check-imports.mjs             # Import + named-export resolution check
```

### Design decisions

- **The server owns the data.** Pages own *query parameters* and render what the API returns
  (`useServerList`), which is what makes SQL-side filtering, sorting and pagination possible.
- **One envelope module.** `lib/apiClient.js` unwraps `{ data, meta }` and normalises
  `{ error: { status, code, message, details } }`, so no component sees the wrapper. On a 422,
  `err.details` is a field-keyed map the forms drop straight into their error state.
- **The token never reaches client JavaScript.** `proxy.js` promotes the httpOnly cookie to an
  `Authorization: Bearer` header and rewrites `/api/*` upstream.
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

All values are rounded to 2 decimals to avoid floating-point drift (`round2`). The maths is
authoritative in `backend/src/lib/billing.js`; `lib/salesLogic.js` mirrors it and is pinned by
`npm run verify`.

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

**Users**
- ADMIN-only: create accounts, change roles, reset passwords (server-generated temporary
  passwords are shown exactly once), deactivate / reactivate
- Self-service "Change password" from the header profile menu (requires the current password)
- Sidebar and action buttons render only what the signed-in role may actually do

---

## Notes

- `npm run verify` runs the billing assertions and validates that every `@/…` import and named
  export in the project resolves.
- See `backend/README.md` for the API contract, the role matrix source of truth, and how to run
  the unit and smoke tests.
