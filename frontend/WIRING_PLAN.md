# Wiring the frontend to the REST API

Status: **complete — all six phases implemented and verified against the running API.**

`localStorage` no longer holds any application data. Filtering, sorting,
pagination, search, and all money and aggregation math are server-side.
Verified by `next build` (clean), `npm run verify` (billing parity + 161 imports),
and manual HTTP exercise of the live stack: login, cookie session, every list
page, both GST branches, discount types, 409/422 paths, and the seed-reset
round-trip.

Sections below are kept as the record of *why* each decision was made. Where a
plan turned out to be wrong at implementation time, the deviation is noted in
"Deviations" at the end of each phase.

The backend is complete, verified on MySQL 8, and its contract is now uniform:
every success response is `{ data }`, every list is `{ data, meta }`. This document
is the file-by-file plan to retire `localStorage` and hand filtering, sorting,
pagination, search, and all money/aggregation math to the server.

Everything below was read from the actual source. Line numbers are anchors, not
patches — they will move as you edit.

---

## The one architectural decision that shapes everything else

**The token must not live in `localStorage`.** Everything else follows from this.

Next.js 16 ships the auth guidance and it is unambiguous: cookies are set on the
server, `httpOnly` so client JavaScript cannot read them, and optimistic route
checks go in `proxy.ts` (in 16, `middleware.ts` is deprecated and renamed to
`proxy`; it runs on the Node.js runtime and only one may exist per project).

Two options, and the tradeoff is real:

| | Direct browser → `:4000` | Next.js BFF (Route Handler or `proxy` rewrite) |
| --- | --- | --- |
| Token storage | `localStorage` — readable by any XSS | `httpOnly` cookie — not reachable from JS |
| CORS | needed (already configured for `:3000`) | same-origin, so none |
| Works if JS is disabled | no | no (it's a client-side app either way) |
| Extra moving parts | none | one proxy layer |

**Recommended: the BFF.** This app is an internal billing tool; the blast radius
of a stolen token is every customer, invoice, and price in the system. The proxy
layer is ~30 lines. `backend` already sets `credentials: true` and CORS for
`localhost:3000`, so the direct path also works today if you want the smaller
diff — but then the token is in `localStorage` and that is a standing risk.

Note that `proxy.ts` should do only the *optimistic* check. The docs are clear
that the real authorization happens at the data source, and `backend` already
enforces the role matrix server-side via `middleware/roles.js`. The proxy is a
UX redirect, never the security boundary.

---

## Phase 1 — transport and auth

### 1a. `next.config.mjs`

Currently an empty object. For the BFF path, add a rewrite so the browser only
ever talks to its own origin:

```js
async rewrites() {
  return [{ source: '/api/:path*', destination: 'http://localhost:4000/api/:path*' }]
}
```

Keep the upstream in an env var rather than hardcoding it — `API_ORIGIN` for
server-only, `NEXT_PUBLIC_API_BASE_URL` if you take the direct path. Note that
`serverRuntimeConfig`/`publicRuntimeConfig` were **removed** in Next 16; env vars
are the only mechanism, and `connection()` is needed before reading a runtime env
var in a server component.

### 1b. New `lib/apiClient.js`

One module, four responsibilities:

1. Attach `Authorization: Bearer` (or rely on the cookie under the BFF path).
2. Unwrap `{ data }` and return `{ data, meta }` to callers.
3. Normalize errors into a thrown `ApiError` carrying `status`, `code`, and
   `details` — so a 422 field map can be fed straight into form `errors` state.
4. On `401`, clear the session and redirect to `/login` exactly once.

This is the single place that knows the envelope. Every later phase assumes it
exists and is correct.

### 1c. `context/AuthContext.js` — 77 lines, replace

Current implementation compares the password to a hardcoded string
(`AuthContext.js:34-51`) and stores the user object in `localStorage`. There is
no token, so **every protected endpoint will 401 the moment you wire this up.**

Keep the exported surface identical — `{ user, isAuthenticated, isLoading, login,
logout, demoCredentials }` — so the three consumers (`login/page.js:18`,
`Header.js:13`, `Sidebar.js:31`, `DashboardLayoutWrapper.js:12`) do not change.

Two consequences to handle deliberately:

- `login` currently returns `{ success, error }` **synchronously**. It must
  become async. `login/page.js:18` is the only caller and already awaits, but
  verify the loading state is wired — otherwise the button double-fires.
- `logout` calls `router.push('/login')` inside the context. Keep it, but it
  should also clear the cookie and notify the backend.

The demo credentials (`admin@flowpilot.in` / `flowpilot123`) already match the
seed, so the login page's "demo credentials" helper keeps working.

### 1d. New `proxy.js` (optional but recommended)

Redirect unauthenticated users away from `(dashboard)` routes before any of it
renders. One file, project-wide. Skip the DB check — read the cookie only.

---

## Phase 2 — the two shared primitives (highest leverage)

Do these before any page, because each single change retires work across
multiple pages.

### 2a. `components/ui/DataTable.js` — one file, four pages

All four list pages hand it `data={filtered}` and it sorts and slices internally
(`DataTable.js:28-45`), so every page currently sorts **twice** and paginates
over an already-filtered array.

Convert it to server-driven: add `page`, `perPage`, `total`, `onPageChange`,
`onSortChange`; delete the `sortedData` memo and the `pageRows` slice.

The column definitions in all four pages stay **completely unchanged** — they are
pure renderers. This is why the change is cheap.

One detail that will bite: `perPage = 10` is hardcoded at `DataTable.js:17`,
which happens to equal the backend's `DEFAULT_LIMIT` (`lib/pagination.js:5`). Keep
that coincidence explicit or the two will drift apart.

### 2b. `components/ui/SearchInput.js` — `FilterChip` counts

`FilterChip` takes a `count` prop that today is computed client-side by filtering
the full array. Under server pagination that number does not exist locally.

The backend already returns exactly what you need: `GET /api/products` carries a
`counts` block (`{ total, inStock, lowStock, outOfStock }`) and `GET /api/invoices`
carries a `counts` block for `Paid|Partial|Partial|Pending|Overdue`. Both are
additive alongside `meta`. Use them instead of recounting.

---

## Phase 3 — the four list pages

Each becomes: read query params → call one endpoint → pass `data` + `meta` to
`DataTable` → keep the existing renderers.

### `app/(dashboard)/inventory/page.js` (414 lines)

Remove the `useMemo` filter (`:73-100`) and sort (`:91-97`) blocks. Replace with
`?search= &category= &status= &sort= &order= &page= &limit=`.

The sort keys the page uses (`stock_asc`, `stock_desc`, `value`, `price`) map to
backend `sort` values — verify the names line up rather than assuming.

Also remove the two client-side sums at `:272` (total stock units) and `:325`
(in-stock count); both are in the `counts` block.

Deep links must keep working: `?action=add`, `?adjust=PRD-101`, `?filter=low_stock`
(`:60-67`). These are UI state, not server state — leave them on the URL.

### `app/(dashboard)/customers/page.js`

Same shape. The filter at `:52-82` covers status, balance-due, and a six-field
text search; the sort at `:73-79` covers value/outstanding/orders/recent.

### `app/(dashboard)/invoices/page.js`

The stats block at `:36-45` (totalBilled, totalCollected, totalDue, paidCount,
overdue, overdueValue) is the aggregate the backend computes in SQL. Replace.

`updateInvoicePayment` becomes `POST /api/invoices/:id/payments`. Note the modal
destructures `error` from `useToast` but never uses it (`RecordPaymentModal.js:12`)
and its `try/catch` cannot currently throw — after wiring this becomes the real
error path, so that dead code should be either used or deleted.

### `app/(dashboard)/sales/page.js`

The heaviest consumer. Two things need care:

- `createSale(payload)` at `:81` is **synchronous** and its result is read
  immediately — `result.sale.invoiceNumber` on `:83`, `result.invoice.id` on
  `:88`. Making it async changes the control flow here; this is the single most
  likely place to introduce a bug.
- The payment-method facet at `:52-55` is a client count over loaded sales. Under
  pagination that becomes a server-side concern or a drop.

---

## Phase 4 — forms (where the real bugs are)

This is the part I would not skip, because four of these fail **silently** rather
than loudly.

### 4a. `CreateSaleForm.js` — three separate mismatches

The form sends `CreateSaleForm.js:141-164`. The backend's `createSaleSchema` is
`validators.js:242-270`. They disagree on more than the survey found:

**1. `paymentMode` — silent no-op.** Form uses `'full' | 'custom' | 'credit'`
(`:20`, `:458-459`); backend accepts `'full' | 'partial' | 'none'`
(`validators.js:252`) and **defaults to `'full'`**. Zod strips unknown keys
without erroring, so a customer choosing "credit" gets a **fully paid invoice**
and sees no error. Map `custom→partial`, `credit→none`, and send
`paymentAmount`.

**2. `discountPercent` — silently zero.** The form sends
`discountPercent: discountType === 'percent' ? Number(discountValue) : 0`
(`:155`). The backend wants `discountType` + `discountValue` and ignores
`discountPercent` entirely, so a discount defaults to `0`. I verified this against
the live API: a payload carrying `discountPercent: 10, discountAmount: 360` came
back `201` with `discountAmount: 0` and `grandTotal: 4248` instead of `3823.20`.

That is a real money bug, not a cosmetic one — a 10% discount is worth ₹424.80 on
that invoice, and the customer is billed full price with no error anywhere.

Note the flat-discount case loses information entirely: the form sends
`discountPercent: 0` plus a computed `discountAmount`, so switching the dropdown
to "flat ₹500" silently becomes "no discount".

**3. `paymentMethod: 'Udyam / COD'` — 422.** `:513` offers a value the backend
enum doesn't have (`validators.js:254-255`). Split it: `value: 'COD'`,
`label: 'Udyam / COD'`.

Also: the form collects `shippingCharges` (`:396`) and includes it in
`grandTotal`, but never submits it. The backend models the field, so this is
currently a collected-but-discarded input. Send it, or remove the input — do not
leave it looking functional.

And `taxType` (`CGST_SGST` vs `IGST`) is decided server-side by comparing the
customer's state to the company's. That is correct as-is; just don't add a
client-side override.

The `customerName`/`customerCompany`/per-line `subtotal` fields are harmless
no-ops — the backend takes a frozen snapshot and re-reads authoritative prices.
Fine to leave.

### 4b. `ProductFormModal.js` — stock is not editable

`updateProductSchema` deliberately omits `stockQuantity` (`validators.js:154-157`)
so every stock change leaves an audit row. The edit form still renders a
required, enabled Stock Quantity input (`:194-203`) and spreads the whole form
(`:92`).

Zod strips it, so **editing a product's stock appears to save and does nothing.**
Disable the input when `isEditing` (`:37`) and point the user at the stock
adjustment flow. Keep it required on create.

### 4c. `StockAdjustmentModal.js` — sign inversion

The form computes a signed `delta` (`:30`) and calls
`onAdjust(product.id, delta, reason)` (`:45`). The backend wants
`{ mode, quantity, notes }` with a **positive** quantity (`validators.js:172-179`).
Convert: `mode` passes through, `quantity: Math.abs(delta)`.

It also concatenates notes into the reason string (`:45`) — the backend has a
separate `notes` field, so split them or the audit trail degrades.

### 4d. `CustomerFormModal.js` — `outstandingBalance` is derived

The form makes it editable; the backend derives it from invoices plus
`opening_balance`. Remove it from the edit form. Otherwise the displayed balance
and the real one drift apart silently.

---

## Phase 5 — dashboard and reports

### `app/(dashboard)/dashboard/page.js`

Pulls **six** collections plus `metrics`. Collapses to three calls:
`GET /api/dashboard/summary`, `/alerts`, `/transactions`.

The backend's `metrics` matches the frontend's derived object **exactly** — I
verified all ten keys the frontend computes are present with identical
definitions. The response is `{ data: { metrics: { ... } } }`; the `metrics` key
is kept because that is its meaningful name on the frontend.

It also returns four keys the frontend doesn't use (`totalStockUnits`,
`totalTaxCollected`, `totalDiscountGiven`, `totalCustomers`) — free, if useful.

### `app/(dashboard)/reports/page.js`

Pulls four collections and runs ~15 aggregations (`:51-136`).
`lib/salesLogic.js` — 262 lines — is **entirely** server-side work now: every one
of its ten exported functions has a backend equivalent. Delete it once the report
endpoints are wired, keeping only `round2` if the sale form still needs client-side
preview math.

### `components/invoices/PrintableInvoice.js` — fix regardless

`:312-322` hardcodes a 50/50 CGST/SGST split on every invoice. For
inter-state supply the backend correctly charges **IGST at the full rate**, and
this will print a tax invoice that is legally wrong. Render from
`invoice.taxType` / `cgstAmount` / `sgstAmount` / `igstAmount`, which the API
already returns. This is a correctness bug in the current frontend, independent
of the wiring work.

---

## Phase 6 — deletions and loose ends

- The 7 `useEffect` blocks in `DataContext.js:72-105` that mirror state into
  `localStorage`, and the 8 `flowpilot_*` keys (`:28-36`).
- `lib/salesLogic.js` aggregators (see above).
- `resetToDemoData()` (`DataContext.js:108-124`), surfaced by `Header.js:14`.
  The backend's `POST /api/seed` is **disabled by default**
  (`ENABLE_SEED_ENDPOINT=false`, `env.js:24-27`). Remove the button or gate it —
  don't leave a control that 404s.
- The double-sorting `useMemo` blocks in all four list pages.

### Behaviours the naive migration will break

`createSale` (`DataContext.js:261-382`) is a **6-write** transaction: generate
codes, deduct stock, update the customer, create the invoice with a frozen
customer snapshot, append the ledger entry, prepend to two arrays.
`updateInvoicePayment` (`:384-441`) is a 4-write transaction. The backend does all
of this atomically with `FOR UPDATE` — which is strictly better, but it means
**no client-side step should be assumed to have partially succeeded.** Don't add
compensating logic; there is nothing to compensate for.

Frozen snapshots are worth understanding: invoices embed the customer name,
company, address, and GSTIN **as they were at sale time**. Editing a customer
later does not rewrite historical invoices. That is correct accounting behaviour,
but the current mock denormalizes the same fields, so it will *look* like a
regression if you expect them to track. They shouldn't.

`paymentStatus: "Overdue"` is likewise time-derived server-side and must never be
written by the client.

### Deviations from the plan

- **`lib/salesLogic.js` was kept, not deleted.** Its aggregators have no callers
  left, but `scripts/verify.mjs` imports them to pin the billing arithmetic
  against `backend/src/lib/billing.js`. Deleting the file would delete the only
  executable statement of that contract. `CreateSaleForm` still uses
  `calculateSaleTotals` / `round2` / `resolvePaymentStatus` for live preview
  before the server responds.
- **`resetToDemoData()` was kept and wired to `POST /api/seed/reset`**, gated on
  `ENABLE_SEED_ENDPOINT`. It is no longer a `localStorage` rewrite, so it can
  genuinely fail; failures are surfaced instead of reported as success. The
  confirm dialog stays open unless the call resolves.
- **A reset ends the session.** The seed wipes `users` and recreates accounts
  under new primary keys, so the caller's JWT stops resolving (`401 Account no
  longer exists`). Rather than let an unrelated-looking 401 bounce the user off
  the dashboard, the reset deliberately logs out to `/login?reset=1`, and the
  login page explains why. `logout()` now takes an optional redirect target.
- **`Report` money is coerced with `asMoney`.** `$queryRaw` returns `DECIMAL`
  columns as *strings*, so the report endpoints were answering with strings while
  `/products` and `/invoices` answered with numbers. Every monetary field in
  `report.repo.js` now goes through `asMoney`, which also fixes `avgOrderValue`
  returning 4 decimal places.

---

## Bugs found and fixed while wiring

Backend defects found by exercising the API, not by reading it:

1. **`product.repo.js salesHistory` selected `i.customer_name`** — no such
   column. The frozen snapshot column is `invoices.snapshot_name`, so the query
   failed with `Unknown column` (500) and took the whole product-detail endpoint
   down with it.
2. **`product.repo.js salesHistory` returned raw `invoice_date`** — a JS `Date`
   from raw SQL, which the service formatted with `String(d).slice(0, 10)`,
   yielding `"Sat Oct 03"` instead of `2026-10-03`. Now `DATE_FORMAT(...,
   '%Y-%m-%d')` in SQL, matching how `report.repo.js` builds bucket keys.
3. **`sale.controller.js` called `invoiceService.statusCounts()` without
   importing it** — `ReferenceError`, so `GET /api/sales` returned 500 outright.
   The chip tallies are the invoice ones because both screens read the same
   `invoices` rows.

Frontend defects:

4. **`RecentTransactions` inferred direction by substring** — `type.includes(
   'income')`. The API returns an explicit `direction: 'IN' | 'OUT'`; used now.
5. **`Header.js` reported reset success unconditionally.** It now awaits, and
   re-throws so `ConfirmDialog` keeps the dialog open on failure.
6. **Filter chips called a state setter during render.** All four list pages
   declared `resetPageAndSet(setter)`, which returns `(value) => { setPage(1);
   setter(value) }` — and then wrote `onClick={resetPageAndSet(setX)('value')}`.
   That *calls* the returned function while rendering, so its `setPage(1)` is a
   render-phase update on the page's own fiber. Inventory, customers and sales
   looped and React threw `Too many re-renders` before painting; the reports
   page happened to dodge it. Each page now has a separate `pickFilter` builder
   that returns the handler instead of performing the update, so the two shapes
   cannot be confused at a call site again.
7. **`invoices/page.js` referenced an undeclared `PER_PAGE`.** It is a legal
   identifier to the compiler (a global lookup) so `next build` stayed silent and
   the page died at runtime with `ReferenceError` inside its `useMemo`. The other
   three list pages define the constant; this one now does too.
8. **`RecordPaymentModal` called `useState` after an early `return`.** The
   `if (!invoice) return null;` guard sat above `const [submitting, setSubmitting]
   = useState(false)`, so the hook list was shorter on first render and longer
   once an invoice was picked — React threw `Rendered more hooks than during the
   previous render` and the "Record Payment" dialog could never open. Every hook
   now precedes the guard, matching the other modals.
9. **`useDebouncedValue` looped on an object argument.** `/reports` passes an
   inline literal (`{ from, to }`); a fresh identity each render re-armed the
   effect, and `setDebounced(newObject)` made that a render loop. Object values
   are now keyed on their JSON serialization.
10. **`/customers?action=add` did nothing.** The dashboard's "Add Customer" quick
    action and the sales empty state both link there, but only `/inventory` and
    `/sales` read their query params. Customers now does, guarded by a ref so the
    form does not re-open after it is closed.
11. **Every browser write returned 500 — a CORS policy rejection reported as a
     server fault.** The `cors` `origin` callback in `backend/src/app.js` ended in
     `callback(new Error(...))` for a disallowed origin. Throwing hands the
     decision to Express's error handler, which logs and returns
     `500 UNHANDLED — Origin http://localhost:3100 is not permitted by CORS
     policy`. Two independent causes stacked:
     - The allow-list did not contain `3100`, which is where `next dev` actually
       runs here because `ai-backend/server.js` holds `3000`.
     - Even with a correct allow-list, a rejected origin must not be a 5xx. CORS
       is enforced by the browser: `callback(null, false)` omits the CORS headers
       so the response is simply unreadable from a disallowed origin, and
       `middleware/auth.js` stays the real gate. A disallowed origin now answers
       `200` with no `Access-Control-Allow-Origin` rather than `500`.

    **Why only writes, and why no earlier test caught it:** browsers omit `Origin`
    on same-origin `GET` but send it on `POST`/`PUT`/`PATCH`/`DELETE`. So reads
    worked and every save 500'd — reported as "internal server error" the first
    time someone clicked Save. PowerShell and the smoke test send no `Origin`
    header at all, which is why every direct HTTP test of the POST endpoints
    passed while the UI was broken. Add a browser-origin header to any manual
    write check:

    ```powershell
    -Headers (@{ Origin = 'http://localhost:3100' } + $auth)
    ```

    The session cookie is `sameSite: 'lax'`, so a genuinely cross-site caller
    still cannot get a token through — the allow-list is defence in depth, not the
    gate. `Origin` is deliberately still forwarded to the backend rather than
    stripped at the BFF, so the real client origin stays auditable.
12. **A stale session cookie rendered a permanently blank app.** Reported as
     "nothing is shown on the screen". Three compounding causes:
     - `DashboardLayoutWrapper` did `return null` when unauthenticated. A blank
       page with no way out is the worst available outcome for a state the app
       can name and explain; it now renders a "Your session has ended" panel
       with a sign-in link.
     - `AuthContext`'s teardown set `user = null` and navigated, but **never
       cleared the cookie**. `proxy.js` only checks that a cookie *exists*, so a
       dead cookie was waved into the dashboard on every reload, where `me()`
       401'd again — which is why reloading never helped. `endSession` now calls
       the BFF logout route, which clears the cookie whether or not the backend
       acknowledges. The cookie is httpOnly, so that route is the only way to
       delete it.
     - The teardown used `router.push`, which lost a race with Next's own URL
       reconciliation — a `replaceState` back to `/dashboard` landed *after* the
       expiry event. Replaced with a hard `location.replace`.

    Three traps in this area, each of which cost a cycle and each of which is
    easy to reintroduce:
     - **`AuthProvider` is in the root layout, so it mounts on `/login` too.**
       Having no session there is the *expected* state. Treating that `me()` 401
       as an expiry and hard-navigating back to `/login` reloads the root layout,
       which calls `me()` again: an infinite redirect loop, observed on the wire
       as ten `me()`+`logout()` cycles in five seconds. `PUBLIC_PATHS` now lives
       in `lib/session.js` and is imported by both `proxy.js` and
       `AuthContext`, so the two cannot drift, and `endSession` refuses to
       navigate when already on a public route. `/login` now issues zero `me()`
       calls.
     - **`location.replace` is not queued behind an earlier one.** The demo-data
       reset invalidates the session *during* `resetToDemoData()`, so the generic
       expiry path fires and navigates to `/login?reset=1` — then `await logout()`
       ran a frame later and replaced it with plain `/login`, losing the banner.
       `endSession` latches on first call; a second call is a no-op.
     - **The expiry teardown knows nothing of intent.** Hence `planSessionEnd`,
       called at the *top* of `handleReset` in `Header.js` rather than after the
       reset, so whichever teardown wins still carries `?reset=1`.

    Diagnose a session problem by counting auth calls on the wire, not by reading
    the DOM: `cdp-race.mjs` prints every `/auth/me` and `/auth/logout` with
    timestamps for a cold load, which is what made the loop visible.

## How these were found

`next build` and `npm run verify` were clean for all of items 6–10. Neither can
see a render-phase state update, a hook-order violation, or an undeclared
identifier that only resolves on a code path the build does not execute.

They were found by driving headless Chrome over the DevTools Protocol and
watching `Runtime.consoleAPICalled` / `Log.entryAdded` while navigating and
clicking: every route, every deep link, every filter chip, every modal trigger.
The scripts are at `%TEMP%\opencode\cdp-*.mjs`; the one that covers everything is
`cdp-full.mjs`. That is the check to reach for on any future change here — the
failure modes that survive a green build are exactly the runtime ones.

One consequence of item 7 worth stating plainly: `next build` reporting
"Compiled successfully" says nothing about whether a page renders. A
`ReferenceError` inside a `useMemo` callback, or a `setState` during render, is
invisible to it.


---

## Verification

`npm run verify` (`scripts/verify.mjs`) asserts exact billing totals — e.g.
4 × 3850 + 2 × 1950, 5% off, 18% GST → `grandTotal` `21635.30`. The backend's
`lib/billing.js` was written to be byte-identical to `lib/salesLogic.js`, so this
passes unchanged. **It passes** — all 11 billing cases plus 161 resolved imports.

`next build` is the only reliable check for the JSX work; `node --check` reports
"ok" on files containing JSX. `next lint` was removed in Next 16 and there is no
`eslint.config.*` in this project, so ESLint cannot be run as-is.

Manual HTTP checks against the running stack, all passing:

| Check | Result |
| --- | --- |
| Anonymous `/dashboard`, `/reports` | `307` to `/login`; `/login` is public |
| Login → cookie, no `token` in body | confirmed |
| Sale, 10% percent discount, intra-state | `7700 / 770 / 6930 / 1247.40`, cgst `623.70` + sgst `623.70`, grand `8177.40`, Partial |
| Sale, ₹250 flat discount, inter-state | `4990 / 250 / 4740 / 853.20` all IGST, grand `5643.20`, Paid |
| Line discount + tax allocation | sums to invoice figures exactly (`192.89 + 57.11 = 250.00`, `658.28 + 194.92 = 853.20`) |
| Stock deduction | atomic in the sale transaction; `42 → 39`, `95 → 92` |
| Oversell | `409` with `{ shortages: [...] }` |
| Overpayment / over-record | `422` with a field-keyed max |
| All 8 invoices | GST split reconstructs `taxAmount`; lines sum to `taxableAmount`; `grand = taxable + tax + shipping`; `balance = grand − paid ≥ 0` |
| Seed reset | re-seeds, then logout clears the cookie and re-login works |

Browser-level checks (headless Chrome over CDP, logged in, watching the console):

| Check | Result |
| --- | --- |
| All 7 routes | render, zero console faults, zero 4xx |
| Anonymous `/login`, `/reports` | login form renders; `/reports` redirects to it |
| Filter chip on each list page | filters server-side: 12 → 4 low stock → 1 out of stock; customers 7 → 4 has dues; sales 8 → 5 paid; invoices 8 → 1 overdue |
| `?action=add`, `?adjust=PRD-101`, `?action=new`, Pay | every dialog opens; `/sales?action=new` renders the POS screen with 7 active customers, a server-searched product picker, and both discount types |
| `/login?reset=1` | "Sample data restored" banner appears |

Every write path, driven through its real form in the browser — the check that
exposed bug 11, and the one to re-run after any CORS or proxy change:

| Flow | Result |
| --- | --- |
| Add Customer (`/customers?action=add`) | `Customer "Ananya Kulkarni" added`, modal closes, row appears |
| Add Product (`/inventory?action=add`) | modal closes, `PRD-113` written with `stock=25` |
| Record Payment (`/invoices` → Pay) | `₹100 payment recorded against INV-2026-003`; re-read shows `Already Paid` up by 100 |
| Adjust Stock (`/inventory?adjust=PRD-101`) | `Stock increased by 7 pcs for Wireless 2D Handheld Barcode Scanner`; re-read shows 42 → 49 |
| `POST` with `Origin: http://localhost:3100` | `201`, with `Access-Control-Allow-Origin` echoed back |
| `GET` with `Origin: http://evil.example` | `200`, **no** ACAO header — browser blocks the read; never a 500 |

Required fields that block submission in these forms, for anyone automating them:
customer needs name, company, email, phone, address, city, state, pincode;
product needs name, SKU, category, MRP, selling price, cost price, stock
quantity, low-stock level.

The two sale payloads above are exactly what `CreateSaleForm.buildPayload()`
emits — same field names, same payment-mode and payment-method mapping.

---

## Suggested order, and what to check at each step

1. `next.config.mjs` + `lib/apiClient.js` + `AuthContext` — then verify login,
   `/api/auth/me`, and a 401 redirect by hand.
2. `DataTable` + `SearchInput` — no page changes yet, so nothing should look
   different. Confirm that.
3. inventory → customers → invoices → sales, one page at a time.
4. Forms, with the four silent-failure fixes above.
5. dashboard → reports, then delete `salesLogic.js`.

At every step: `npm run verify` must stay green, and the four silent bugs (3a.1,
3a.2, 4b, 4d) are the ones that will not announce themselves.
