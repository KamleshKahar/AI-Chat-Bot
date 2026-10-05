# FlowPilot Sales & Inventory — REST API

A drop-in replacement for the frontend's `localStorage` / mock data layer. Every
number the UI used to compute in the browser is computed here, authoritatively,
and persisted.

- **Stack** — Node.js 20+, JavaScript (ESM), Express 5, MySQL 8, Prisma 6
- **Docs** — Swagger UI at `/api/docs`, raw spec at `/api/openapi.json`
- **Port** — 4000 (the frontend dev server owns 3000)

---

## Quick start

```bash
cp .env.example .env          # then edit DATABASE_URL
npm install
npm run prisma:generate
npm run migrate:deploy        # or `npm run migrate` while developing
npm run seed                  # demo dataset + 4 role accounts
npm start                     # http://localhost:4000
```

Verify the whole contract end to end (in a second shell, against a seeded DB):

```bash
npm run smoke-test
```

`scripts/smoke-test.js` is the acceptance test: **169 assertions** covering auth,
CRUD, the billing engine, GST splitting, stock movement, the concurrency guard,
the role matrix, every report, and the error envelopes. It exits non-zero on the
first regression.

### Seeded logins

All four use the password `flowpilot123`.

| Email | Role | Can |
| --- | --- | --- |
| `admin@flowpilot.in` | ADMIN | everything, including product deletion and re-seeding |
| `manager@flowpilot.in` | MANAGER | catalogue, customers, sales, payments, reports |
| `cashier@flowpilot.in` | CASHIER | ring up sales, adjust stock, read catalogue |
| `viewer@flowpilot.in` | VIEWER | read-only, no reports |

---

## Scripts

| Script | Purpose |
| --- | --- |
| `npm start` | Run the server |
| `npm run dev` | Run with `--watch` |
| `npm run migrate` | Create + apply a migration (dev) |
| `npm run migrate:deploy` | Apply pending migrations (prod) |
| `npm run migrate:reset` | Drop, re-migrate, re-seed |
| `npm run seed` | Seed the demo dataset (same code as `POST /api/seed/reset`) |
| `npm run smoke-test` | Full end-to-end acceptance test |
| `npm run openapi` | Print the OpenAPI document (pass a path to write it) |
| `npm run build` | Generate the Prisma client and validate the schema |

---

## Architecture

```
routes/  ->  controllers/  ->  services/  ->  repositories/  ->  Prisma
```

- **routes** declare the path, permission and Zod schema for each request
- **controllers** only translate HTTP <-> service calls
- **services** own the business rules and transactions
- **repositories** own SQL. Prisma is confined to this layer so the raw SQL
  (derived stock status, customer aggregates, report maths) stays in one place.

### Config

`src/config/env.js` validates `process.env` with Zod at boot — a missing or
malformed variable fails immediately with a readable message instead of surfacing
as a confusing error on the first request.

---

## Design decisions worth knowing

### Money is never a float

Every monetary column is `DECIMAL(14,2)`, every calculation goes through
`decimal.js`, and every value is rounded half-up to 2 dp. Line-level discount and
tax are allocated with a **largest-remainder** algorithm (`lib/decimal.js#allocate`)
so the lines always sum *exactly* to the invoice figure — no off-by-a-paisa drift.

### The client is never trusted with money

`POST /api/sales` discards any client-supplied `subtotal`, `taxAmount`,
`discountAmount`, `grandTotal` or per-line subtotal and recomputes everything from
`(product, quantity, unitPrice, discount, taxRate, shipping)`. The authoritative
formula in `lib/billing.js` is byte-identical to the frontend's
`lib/salesLogic.js`:

```
lineAmount     = quantity x unitPrice
subtotal       = SUM(lineAmount)
discountAmount = percent -> subtotal x clamp(percent, 0, 100) / 100
              | flat    -> clamp(value, 0, subtotal)
taxableAmount  = subtotal - discountAmount
taxAmount      = taxableAmount x rate / 100
grandTotal     = taxableAmount + taxAmount + shippingCharges
```

`unitPrice` *is* honoured from the client so negotiated rates keep working, but
falls back to the catalogue selling price when omitted.

### GST is derived from place of supply

`taxType` is `CGST_SGST` when the customer's state matches the company's state
(each at half the rate) and `IGST` at the full rate otherwise
(`lib/gst.js#resolveTaxType`). `cgstAmount`, `sgstAmount` and `igstAmount` are
persisted separately on both the invoice and each line, so a reprint never has to
re-derive them and the odd paisa always lands on SGST.

### Derived values are never stored

Two values look like columns but are computed on read, because storing them lets
them drift:

- **Stock status** — `out_of_stock` / `low_stock` / `in_stock` from
  `stock_quantity` vs `min_stock_level`. Filtering *and sorting* on it happen in
  SQL (`repositories/product.repo.js#STATUS_SQL`), otherwise "sort by stock
  ascending" would only sort one arbitrary page.
- **`Overdue`** — only `PENDING | PARTIAL | PAID` are persisted. `Overdue` is a
  function of `due_date` and today, so it is derived in the `paymentStatus`
  projection and in the SQL filter.

`Paid / Partial / Pending / Overdue` are a **true partition** of the invoice
list: every invoice appears in exactly one bucket, and the counts in the list
response's `counts` envelope are computed with the same predicates as the
filters, so

```
counts.Paid + counts.Partial + counts.Pending + counts.Overdue === counts.All
```

and clicking a chip always returns exactly `counts[chip]` rows. The consequence
worth knowing: **`Partial` and `Pending` exclude invoices that are past due**
(a partly-paid invoice reads as `Overdue`, not `Partial`), and its `paymentStatus`
field is `Overdue`, so a filtered list never shows a badge that contradicts the
tab you selected.

### Human-readable codes, exposed as `id`

`PRD-101`, `CUST-001`, `CAT-01`, `SALE-1001`, `INV-2026-009`, `TXN-908` are real
UNIQUE columns alongside a `BIGINT` surrogate key. Numbers come from
`document_sequences` (`prefix`, `period`, `last_number`) allocated with
`SELECT ... FOR UPDATE` **inside** the creating transaction, so two concurrent
creates can never collide. Invoices are numbered per calendar year.

**The serializer returns the code in the `id` field.** That single decision is
what keeps the frontend diff small — `product.id` is still `"PRD-101"`, so the
UI's existing key props, link builders and `selectedProduct` lookups keep working
unchanged.

### Sales and Invoices are one table, two projections

Both screens read `invoices`. `serializeSale` produces the POS shape (`id` =
`SALE-1001`, `date`) and `serializeInvoice` the document shape (`id` =
`INV-2026-009`, `customer` = frozen snapshot, `saleId` back to the sale code).

### Historical snapshots are mandatory

An invoice stores the customer's name, company, email, phone, address, city,
state, pincode and GSTIN, plus each line's product name, SKU, unit and tax rate.
Rendering never joins live rows, so renaming a product or a customer today cannot
alter what a 2024 invoice says it sold.

### Concurrency: overselling is impossible

`createSale` runs as one transaction that locks every product row
(`SELECT ... FOR UPDATE`) **before** reading its quantity, checks availability
against those locked values, then writes the invoice, items, stock movements,
payment, cash-ledger entry and audit row together. Locking after reading would
leave a window where a concurrent deduction commits and the second sale still
sees the stale higher level — that is exactly the race that lets two sales
oversell. The smoke test fires two simultaneous sales for the last 5 units and
asserts exactly one wins with `201` and the other gets `409`.

Stock is additionally guarded by a relative `UPDATE`, and stock is never negative.

### Soft deletes

`categories`, `products`, `customers` and `invoices` carry `deleted_at`. Deletes
are refused with `409` while another live row still references them (a category
with products, a product with invoice history). Only an ADMIN purge endpoint can
hard-delete, and it refuses if an invoice references the row.

### Listing, filtering and reporting happen in SQL

The backend owns filtering, sorting, pagination, search and every aggregation —
there are no unbounded collections. All list endpoints take `page` / `limit`
(default 10, max 100), `search`, `sort`, `order`, plus resource-specific filters,
and return:

```json
{ "data": [ ... ], "meta": { "total": 84, "page": 1, "limit": 10, "totalPages": 9 } }
```

**Every success response uses the `{ data }` envelope, without exception** —
including `POST /api/auth/login`, which returns
`{ "data": { "token": "...", "user": { ... } } }`, and the `DELETE` responses,
which return `{ "data": { "id": "PRD-101", "deleted": true } }`. A client can
therefore treat all responses identically and never special-case the calls it
makes first. This is asserted across all 19 success endpoints by the smoke test,
so the property cannot silently regress.

Two endpoints carry an extra block alongside `data`, both additive:

| Endpoint | Extra | Why |
| --- | --- | --- |
| `GET /api/products` | `counts` | `{ total, inStock, lowStock, outOfStock }` — the inventory filter chips need all four numbers in one round trip |
| `GET /api/invoices` | `counts` | `{ Paid, Partial, Pending, Overdue }` — status chips are a true partition, so these sum to `meta.total` |

`GET /api/dashboard/summary` returns `{ data: { metrics: { ... } } }`; the
`metrics` key is preserved because that is its meaningful name on the frontend.

`GET /api/categories` is the one deliberately unpaginated list: the product filter
dropdowns need the complete active set, and the collection is bounded by nature.
It still returns `meta` (`page` and `totalPages` always `1`) so the response shape
stays uniform.

Search is case-insensitive via MySQL's `utf8mb4_*_ci` collation. (Prisma's
`mode: 'insensitive'` is Postgres-only and invalid here.)

`GET /api/reports/revenue-trend` returns a **gapless, zero-filled** daily series,
so a chart never draws a misleading straight line across days with no sales.

---

## Contract

### Errors

```json
{ "error": { "status": 422, "message": "Validation failed", "code": "VALIDATION_FAILED",
             "details": { "pincode": "Must be exactly 6 digits" } } }
```

`details` is keyed by field path. Stack traces and driver messages are logged
server-side and never returned.

| Status | Meaning |
| --- | --- |
| 400 | malformed JSON |
| 401 | missing / invalid / expired token |
| 403 | authenticated but the role lacks the permission |
| 404 | not found (including soft-deleted rows) |
| 409 | conflict — duplicate SKU, insufficient stock, still-referenced delete |
| 422 | validation failed, with field-keyed `details` |

### Permissions

Deny-by-default matrix in `src/middleware/roles.js`. A role absent from the map
gets nothing, so adding a value to Prisma's enum cannot accidentally grant access.

| | ADMIN | MANAGER | CASHIER | VIEWER |
| --- | :-: | :-: | :-: | :-: |
| Read catalogue / customers / sales / invoices | ✅ | ✅ | ✅ | ✅ |
| Dashboard + ledger | ✅ | ✅ | ✅ | ✅ |
| Create products / customers / sales | ✅ | ✅ | sales only | ❌ |
| Adjust stock | ✅ | ✅ | ✅ | ❌ |
| Record payments | ✅ | ✅ | ❌ | ❌ |
| View reports | ✅ | ✅ | ❌ | ❌ |
| Delete products | ✅ | ❌ | ❌ | ❌ |

### Validation highlights

- **customer** — name required, valid email, phone required, pincode exactly 6
  digits, gstin exactly 15 alphanumeric
- **product** — name, unique sku, category required, `mrp > 0`,
  `cost_price > 0`, `0 < selling_price <= mrp`, `cost_price <= selling_price`,
  `stock_quantity >= 0`, `min_stock_level >= 0`
- **sale** — customer required, at least one line, `quantity > 0`, no line beyond
  available stock, `0 <= paid <= grandTotal`
- **payment** — `amount` must not exceed the outstanding balance

---

## Security

- bcryptjs (cost 12) password hashing
- HS256 JWTs with configurable expiry
- `helmet` security headers, `x-powered-by` disabled
- CORS restricted to `CORS_ORIGINS`; non-browser clients without an `Origin`
  header are allowed so `curl` and the smoke test work
- JSON body size limited by `JSON_LIMIT`
- `morgan` request logging with a per-request id, echoed as `x-request-id`
- audit log for every mutation, with the acting user and IP
- `POST /api/seed/reset` destroys all data — it 404s unless
  `ENABLE_SEED_ENDPOINT=true` **and** the caller is an ADMIN

---

## Single tenancy, but structured for more

There is no `company_id` anywhere; the company profile is one table with one row,
and GST place-of-supply reads from it. The layering keeps that reversible: adding
a `company_id` means a schema change plus a scoping clause in the repositories,
not a rewrite of the API layer or the frontend.

---

## Data model

13 tables, defined in `prisma/schema.prisma`:

`company_profile`, `users`, `document_sequences`, `categories`, `products`,
`customers`, `invoices`, `invoice_items`, `payments`, `stock_movements`,
`ledger_entries`, `audit_log`, plus the `session`/`audit` indexes.

`stock_movements` is the reason `products.stock_quantity` can be trusted: it is a
full audit trail, and `SUM(quantity_delta)` reconciles to the live figure exactly.
The seeder asserts this on every run.

Every column is snake_case in the database, mapped to camelCase in Prisma. The raw
SQL in `repositories/` relies on that convention, so keep `@map` on any new column.

---

## Environment

See `.env.example`. The ones that matter:

| Variable | Default | Notes |
| --- | --- | --- |
| `PORT` | `4000` | |
| `DATABASE_URL` | — | `mysql://user:pass@host:3306/flowpilot` |
| `JWT_SECRET` | — | required in production |
| `JWT_EXPIRES_IN` | `8h` | |
| `CORS_ORIGINS` | `http://localhost:3000` | comma-separated |
| `JSON_LIMIT` | `1mb` | |
| `ENABLE_SEED_ENDPOINT` | `false` | |
| `BCRYPT_ROUNDS` | `12` | |

---

## Known environment notes

`ai-backend/server.js` also listens on **3000**, which collides with `next dev`.
This API uses 4000, so run the frontend on 3000 and this on 4000 — but be aware
that starting `ai-backend` will fail to bind while `next dev` is running.

Keep `PORT` off the database port. `PORT=3306` binds against MySQL itself and the
process exits with `EADDRINUSE`; `npm run smoke-test` then talks raw HTTP to
MySQL's wire protocol and fails with a confusing `HTTPParserError`.

---

## Verified on

MySQL **8.0.46** with `sql_mode` = `ONLY_FULL_GROUP_BY, STRICT_TRANS_TABLES,
NO_ZERO_IN_DATE, NO_ZERO_DATE, ERROR_FOR_DIVISION_BY_ZERO, NO_ENGINE_SUBSTITUTION`
and `utf8mb4_0900_ai_ci`. A clean `npm run migrate` + `npm run seed` +
`npm run smoke-test` passes **169/169**.

Two MySQL 8 specifics are load-bearing and already baked into the schema:

- **Date-only defaults must be parenthesised expressions.** `customers.joined_at`
  is `DATE NOT NULL DEFAULT (CURRENT_DATE)`. Prisma's natural
  `@default(now())` renders as `CURRENT_TIMESTAMP(3)`, which MySQL 8 rejects with
  `1067 Invalid default value` (a `DATE` cannot hold sub-second precision), and
  the bare `DEFAULT CURRENT_DATE` fallback is a MariaDB-ism that fails with
  `1064`. `@default(dbgenerated("(CURRENT_DATE)"))` is the only form that works.
  MariaDB tolerates all three; MySQL 8 rejects the first two. Worth remembering
  for any future date-only column.
- **`ONLY_FULL_GROUP_BY` is on.** The derived-table pattern in
  `repositories/invoice.repo.js` (status partition counts) depends on selecting
  the `CASE` expression's aliases in the inner query rather than repeating the
  expression in `GROUP BY`.