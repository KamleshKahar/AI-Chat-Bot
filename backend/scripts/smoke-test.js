/**
 * End-to-end acceptance test.
 *
 * Exercises the full contract against a running server:
 *   auth -> catalogue CRUD -> customer CRUD -> sale (with authoritative totals
 *   and stock movement) -> partial payment -> final payment -> derived Overdue
 *   -> all reports -> concurrency (two overselling sales, exactly one wins)
 *   -> soft delete -> validation failures -> error envelope shape
 *
 * Run against a freshly seeded database:
 *   npm run seed && npm start          # in one shell
 *   npm run smoke-test                 # in another
 *
 * Exits non-zero on the first failed expectation.
 */
import 'dotenv/config';

const BASE = process.env.SMOKE_BASE_URL ?? `http://localhost:${process.env.PORT ?? 4000}`;
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'admin@flowpilot.in';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'flowpilot123';

let passed = 0;
let failed = 0;
const failures = [];
let token = null;

/**
 * Per-run suffix for every unique key this test creates (category name, SKU,
 * email, ledger reference).
 *
 * Soft delete sets `deleted_at` but does not release the row's `@unique`
 * constraint, so a second run against the same database would collide with the
 * first run's tombstoned rows and fail with 409/422 before reaching any real
 * assertion. Scoping the keys to the run keeps the suite re-runnable without a
 * `migrate reset` in between.
 */
const RUN = process.env.SMOKE_RUN_ID ?? Date.now().toString(36).toUpperCase().slice(-6);

/**
 * Run-scoped GSTIN. `customers.gstin` is UNIQUE and soft delete does not
 * release a unique constraint, so a fixed GSTIN makes the *second* run 409 at
 * customer create and crash the suite at the next `buyer.id`. Fifteen
 * alphanumeric characters, matching `gstinSchema`.
 */
const GSTIN = `27AAAAA${RUN}1Z`;

/**
 * Every invoice this run creates, so section 13 can soft-delete them again.
 * Sales are the only thing this test writes that has no natural cascade
 * cleanup: a soft-deleted customer/product does not remove the invoices that
 * referenced it, so without this the seeded dataset grows by ~6 invoices and
 * ~8 ledger rows on every run and the report assertions drift.
 */
const createdInvoices = new Set();

/** Records the invoice id from a successful sale response, if present. */
function trackInvoice(res) {
  const invoice = res?.body?.data?.invoice;
  if (invoice?.id) createdInvoices.add(invoice.id);
  return invoice;
}

// ---------------------------------------------------------------------------
// Tiny test harness
// ---------------------------------------------------------------------------

function check(label, condition, detail) {
  if (condition) {
    passed += 1;
    console.log(`  \u2713 ${label}`);
  } else {
    failed += 1;
    failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
    console.log(`  \u2717 ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

function section(name) {
  console.log(`\n${name}`);
}

function eq(label, actual, expected) {
  check(
    label,
    Object.is(actual, expected) || String(actual) === String(expected),
    `expected ${expected}, got ${actual}`
  );
}

/** Money comparison in paisa, immune to float formatting noise. */
function money(label, actual, expected) {
  const a = Math.round(Number(actual) * 100);
  const e = Math.round(Number(expected) * 100);
  check(label, a === e, `expected ${e / 100}, got ${a / 100}`);
}

async function api(method, path, body, options = {}) {
  const headers = { ...(options.headers ?? {}) };
  if (token) headers.Authorization = `Bearer ${token}`;

  let payload;
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  const res = await fetch(`${BASE}${path}`, { method, headers, body: payload });

  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }

  return { status: res.status, body: json, headers: res.headers };
}

// ---------------------------------------------------------------------------
// The test run
// ---------------------------------------------------------------------------

async function run() {
  console.log(`FlowPilot API smoke test against ${BASE}\n${'='.repeat(64)}`);

  // -------------------------------------------------------------------------
  section('1. Health & auth');

  const health = await api('GET', '/api/health');
  eq('GET /api/health -> 200', health.status, 200);
  eq('health status ok', health.body?.status, 'ok');
  eq('database reachable', health.body?.database, 'up');

  const badLogin = await api('POST', '/api/auth/login', {
    email: ADMIN_EMAIL,
    password: 'wrong-password',
  });
  eq('login with wrong password -> 401', badLogin.status, 401);
  check(
    'error envelope has status/code/message',
    badLogin.body?.error?.status === 401 &&
      typeof badLogin.body?.error?.code === 'string' &&
      typeof badLogin.body?.error?.message === 'string',
    JSON.stringify(badLogin.body)
  );
  check('no stack trace leaked', !JSON.stringify(badLogin.body).includes('at '));

  const login = await api('POST', '/api/auth/login', {
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
  });
  eq('login -> 200', login.status, 200);
  // Every success response uses the `{ data, meta }` envelope, auth included.
  check('login is wrapped in data', typeof login.body?.data === 'object' && login.body.data !== null);
  check(
    'login returns a token',
    typeof login.body?.data?.token === 'string' && login.body.data.token.length > 20
  );
  eq('login returns role ADMIN', login.body?.data?.user?.role, 'ADMIN');
  token = login.body.data.token;

  const noToken = await fetch(`${BASE}/api/products`);
  eq('protected route without token -> 401', noToken.status, 401);

  const badToken = await fetch(`${BASE}/api/products`, {
    headers: { Authorization: 'Bearer not-a-real-token' },
  });
  eq('protected route with bad token -> 401', badToken.status, 401);

  const me = await api('GET', '/api/auth/me');
  eq('GET /api/auth/me -> 200', me.status, 200);
  eq('me.email matches', me.body?.data?.email, ADMIN_EMAIL);

  // -------------------------------------------------------------------------
  section('2. Company profile');

  const company = await api('GET', '/api/company');
  eq('GET /api/company -> 200', company.status, 200);
  eq('company name', company.body?.data?.name, 'FlowPilot Solutions Pvt Ltd');
  eq('company state (drives GST)', company.body?.data?.state, 'Maharashtra');

  // -------------------------------------------------------------------------
  section('3. Catalogue: categories');

  const categories = await api('GET', '/api/categories');
  eq('GET /api/categories -> 200', categories.status, 200);
  check('categories seeded', (categories.body?.data?.length ?? 0) >= 6);
  check(
    'category id is the human code',
    categories.body?.data?.some((c) => c.id === 'CAT-01' && c.code === 'CAT-01'),
    JSON.stringify(categories.body?.data?.[0])
  );
  // Categories are unpaginated by design but still carry `meta`, so the frontend
  // can read every list endpoint through one code path.
  eq(
    'categories carry the standard list meta',
    categories.body?.meta?.total,
    categories.body?.data?.length
  );
  eq('categories meta.totalPages is 1 (unpaginated)', categories.body?.meta?.totalPages, 1);

  const newCategory = await api('POST', '/api/categories', {
    name: `Smoke Test Consumables ${RUN}`,
    description: 'Created by the smoke test',
  });
  eq('POST /api/categories -> 201', newCategory.status, 201);
  check('new category gets a CAT- code', /^CAT-\d+$/.test(newCategory.body?.data?.id ?? ''));
  const categoryId = newCategory.body?.data?.id;

  // Same name, same run: must still be a 409, which proves the uniqueness guard
  // is live rather than merely untested.
  const dupeCategory = await api('POST', '/api/categories', { name: `Smoke Test Consumables ${RUN}` });
  eq('duplicate category name -> 409', dupeCategory.status, 409);

  // -------------------------------------------------------------------------
  section('4. Catalogue: products');

  const products = await api('GET', '/api/products?limit=100');
  eq('GET /api/products -> 200', products.status, 200);
  check('pagination meta present', typeof products.body?.meta?.total === 'number');
  check(
    'meta has page/limit/totalPages',
    ['page', 'limit', 'totalPages'].every((k) => typeof products.body?.meta?.[k] === 'number'),
    JSON.stringify(products.body?.meta)
  );

  const createdProduct = await api('POST', '/api/products', {
    name: `Smoke Test Barcode Labels ${RUN}`,
    sku: `SMOKE-LBL-${RUN}`,
    category: categoryId,
    mrp: 500,
    sellingPrice: 400,
    costPrice: 250,
    taxRate: 18,
    stockQuantity: 100,
    minStockLevel: 10,
    unit: 'roll',
  });
  eq('POST /api/products -> 201', createdProduct.status, 201);
  const product = createdProduct.body?.data;
  check('product id is a PRD- code', /^PRD-\d+$/.test(product?.id ?? ''), product?.id);
  eq('derived status in_stock', product?.status, 'in_stock');
  money('stockValue = qty x cost', product?.stockValue, 100 * 250);

  // Validation rules
  const overMrp = await api('POST', '/api/products', {
    name: 'Bad', sku: `SMOKE-BAD-1-${RUN}`, category: categoryId,
    mrp: 100, sellingPrice: 500, costPrice: 50,
  });
  eq('sellingPrice > mrp -> 422', overMrp.status, 422);
  check(
    'validation details are field-keyed',
    typeof overMrp.body?.error?.details?.sellingPrice === 'string',
    JSON.stringify(overMrp.body?.error)
  );

  const badCost = await api('POST', '/api/products', {
    name: 'Bad', sku: `SMOKE-BAD-2-${RUN}`, category: categoryId,
    mrp: 500, sellingPrice: 400, costPrice: 450,
  });
  eq('costPrice > sellingPrice -> 422', badCost.status, 422);

  const dupeSku = await api('POST', '/api/products', {
    name: 'Bad', sku: `SMOKE-LBL-${RUN}`, category: categoryId,
    mrp: 500, sellingPrice: 400, costPrice: 250,
  });
  eq('duplicate SKU -> 409', dupeSku.status, 409);

  const negativeStock = await api('POST', '/api/products', {
    name: 'Bad', sku: `SMOKE-BAD-3-${RUN}`, category: categoryId,
    mrp: 500, sellingPrice: 400, costPrice: 250, stockQuantity: -5,
  });
  eq('negative stock -> 422', negativeStock.status, 422);

  const badCategory = await api('POST', '/api/products', {
    name: 'Bad', sku: `SMOKE-BAD-4-${RUN}`, category: 'NOPE-99',
    mrp: 500, sellingPrice: 400, costPrice: 250,
  });
  eq('unknown category -> 422', badCategory.status, 422);

  // Derived stock status filtering happens in SQL.
  const outOfStock = await api('GET', '/api/products?status=out_of_stock&limit=100');
  eq('filter status=out_of_stock -> 200', outOfStock.status, 200);
  check(
    'every returned product really is out_of_stock',
    (outOfStock.body?.data ?? []).every((p) => p.status === 'out_of_stock'),
    JSON.stringify((outOfStock.body?.data ?? []).map((p) => [p.id, p.stockQuantity, p.status]))
  );

  const lowStock = await api('GET', '/api/products?status=low_stock&limit=100');
  check(
    'every low_stock product has 0 < stock <= minStock',
    (lowStock.body?.data ?? []).every((p) => p.stockQuantity > 0 && p.stockQuantity <= p.minStockLevel),
    JSON.stringify((lowStock.body?.data ?? []).map((p) => [p.id, p.stockQuantity, p.minStockLevel, p.status]))
  );

  const sortedAsc = await api('GET', '/api/products?sort=stock_asc&limit=100');
  const quantities = (sortedAsc.body?.data ?? []).map((p) => p.stockQuantity);
  check(
    'sort=stock_asc is ordered in SQL',
    quantities.every((q, i) => i === 0 || quantities[i - 1] <= q),
    JSON.stringify(quantities)
  );

  const search = await api('GET', '/api/products?search=barcode%20labels&limit=100');
  check(
    'case-insensitive search finds the product',
    (search.body?.data ?? []).some((p) => p.id === product.id),
    JSON.stringify((search.body?.data ?? []).map((p) => p.id))
  );

  // Stock adjustment
  const adjust = await api('POST', `/api/products/${product.id}/stock-adjustments`, {
    mode: 'add', quantity: 25, reason: 'Smoke test restock',
  });
  eq('POST stock-adjustments -> 201', adjust.status, 201);
  eq('stock after add', adjust.body?.data?.product?.stockQuantity, 125);

  const overRemove = await api('POST', `/api/products/${product.id}/stock-adjustments`, {
    mode: 'remove', quantity: 9999, reason: 'Too much',
  });
  eq('removing more than stock -> 409', overRemove.status, 409);

  // -------------------------------------------------------------------------
  section('5. Customers');

  const customer = await api('POST', '/api/customers', {
    name: `Smoke Test Buyer ${RUN}`,
    company: 'Smoke Test Traders',
    email: `buyer-${RUN.toLowerCase()}@smoketest.in`,
    phone: '+91 90000 00001',
    city: 'Mumbai',
    state: 'Maharashtra',
    pincode: '400001',
    gstin: GSTIN,
  });
  eq('POST /api/customers -> 201', customer.status, 201);
  // Fail loudly and usefully here. Without this, a 409 on create leaves `buyer`
  // undefined and the suite dies at the next `buyer.id` with a TypeError that
  // says nothing about the duplicate that actually caused it.
  if (customer.status !== 201) {
    throw new Error(
      `could not create the test customer (HTTP ${customer.status}): ` +
        `${JSON.stringify(customer.body)}\n` +
        'If this is a 409, a previous run left a soft-deleted row holding this ' +
        'email or GSTIN. Re-run with a fresh SMOKE_RUN_ID, or `npm run migrate:reset`.'
    );
  }
  const buyer = customer.body?.data;
  check('customer id is a CUST- code', /^CUST-\d+$/.test(buyer?.id ?? ''), buyer?.id);
  money('new customer outstanding starts at 0', buyer?.outstandingBalance, 0);
  eq('new customer orders starts at 0', buyer?.ordersCount, 0);

  const badPin = await api('POST', '/api/customers', {
    name: 'Bad', email: `bad-${RUN.toLowerCase()}@smoketest.in`, phone: '+91 90000 00002', pincode: '123',
  });
  eq('3-digit pincode -> 422', badPin.status, 422);
  check(
    'pincode error is field-keyed',
    typeof badPin.body?.error?.details?.pincode === 'string',
    JSON.stringify(badPin.body?.error)
  );

  const badGstin = await api('POST', '/api/customers', {
    name: 'Bad', email: `bad2-${RUN.toLowerCase()}@smoketest.in`, phone: '+91 90000 00003', gstin: 'TOOSHORT',
  });
  eq('malformed GSTIN -> 422', badGstin.status, 422);

  const badEmail = await api('POST', '/api/customers', {
    name: 'Bad', email: 'not-an-email', phone: '+91 90000 00004',
  });
  eq('invalid email -> 422', badEmail.status, 422);

  // -------------------------------------------------------------------------
  section('6. Sales: totals, stock and trust boundary');

  // Customer in Maharashtra, company in Maharashtra -> CGST + SGST.
  const sale = await api('POST', '/api/sales', {
    customerId: buyer.id,
    items: [
      { productId: product.id, quantity: 2 },
      { productId: 'PRD-104', quantity: 3 },
    ],
    discountType: 'percent',
    discountValue: 10,
    taxRate: 18,
    paymentMode: 'full',
    paymentMethod: 'UPI',
    notes: 'Smoke test sale',
  });
  eq('POST /api/sales -> 201', sale.status, 201);

  const createdSale = sale.body?.data?.sale;
  const createdInvoice = trackInvoice(sale);

  // lineAmount = qty * unitPrice; discount; taxable; tax at 18%; grand total.
  //   (2*400) + (3*1950) = 800 + 5850 = 6650 subtotal
  //   discount 10%       = 665
  //   taxable            = 5985
  //   tax 18%            = 1077.30
  //   grand total        = 7062.30
  const expectedSubtotal = 6650;
  const expectedDiscount = 665;
  const expectedTaxable = 5985;
  const expectedTax = 1077.3;
  const expectedGrand = 7062.3;

  money('subtotal', createdSale?.subtotal, expectedSubtotal);
  money('discountAmount (10%)', createdSale?.discountAmount, expectedDiscount);
  money('taxableAmount', createdSale?.taxableAmount ?? createdInvoice?.taxableAmount, expectedTaxable);
  money('taxAmount (18%)', createdSale?.taxAmount, expectedTax);
  money('grandTotal', createdSale?.grandTotal, expectedGrand);
  money('paid in full', createdSale?.paidAmount, expectedGrand);
  eq('paymentStatus Paid', createdSale?.paymentStatus, 'Paid');

  check('sale code allocated', /^SALE-\d+$/.test(createdSale?.id ?? ''), createdSale?.id);
  check('invoice number allocated', /^INV-\d{4}-\d{3}$/.test(createdInvoice?.id ?? ''), createdInvoice?.id);
  eq('invoice exposes saleId', createdInvoice?.saleId, createdSale?.id);

  // Intra-state supply must split into CGST + SGST, never IGST.
  eq('intra-state taxType', createdInvoice?.taxType, 'CGST_SGST');
  eq('IGST is zero intra-state', createdInvoice?.igstAmount, 0);
  money('CGST + SGST reconstructs tax', Number(createdInvoice?.cgstAmount) + Number(createdInvoice?.sgstAmount), expectedTax);
  check('CGST and SGST are balanced', createdInvoice?.cgstAmount === createdInvoice?.sgstAmount);

  // Line items must add up to the invoice.
  const lineSum = (createdInvoice?.items ?? []).reduce((acc, i) => acc + Number(i.taxableValue), 0);
  money('line taxable values sum to invoice taxable', lineSum, expectedTaxable);
  const cgstSum = (createdInvoice?.items ?? []).reduce((acc, i) => acc + Number(i.cgstAmount), 0);
  money('line CGST sums to invoice CGST', cgstSum, createdInvoice?.cgstAmount);

  // Frozen customer snapshot on the document.
  eq('invoice snapshots customer name', createdInvoice?.customer?.name, `Smoke Test Buyer ${RUN}`);
  eq('invoice snapshots customer GSTIN', createdInvoice?.customer?.gstin, GSTIN);

  // Stock decremented by the sold quantities.
  const afterSale = await api('GET', `/api/products/${product.id}`);
  eq('stock decremented 125 -> 123', afterSale.body?.data?.product?.stockQuantity, 123);
  const stockDetail = await api('GET', `/api/products/${product.id}?from=2000-01-01&to=2100-01-01`);
  const saleMovement = (stockDetail.body?.data?.movements ?? []).find((m) => m.referenceId === createdInvoice?.id);
  eq('SALE movement recorded', saleMovement?.type, 'SALE');
  eq('movement delta is negative', saleMovement?.quantityDelta, -2);
  eq('movement stockAfter matches live stock', saleMovement?.stockAfter, 123);

  // Client-supplied totals are ignored (trust boundary).
  const spoofed = await api('POST', '/api/sales', {
    customerId: buyer.id,
    items: [{ productId: product.id, quantity: 1 }],
    discountType: 'percent',
    discountValue: 0,
    taxRate: 18,
    paymentMode: 'full',
    paymentMethod: 'Cash',
    // Every one of these lies. None may influence the response.
    subtotal: 1,
    grandTotal: 1,
    taxAmount: 0,
    discountAmount: 999,
  });
  eq('sale with spoofed totals -> 201', spoofed.status, 201);
  const spoofedSale = spoofed.body?.data?.sale;
  // This sale is real — only its client-supplied totals were lies — so it owns a
  // real invoice that section 13 has to clean up too.
  trackInvoice(spoofed);
  money('spoofed subtotal ignored', spoofedSale?.subtotal, 400);
  money('spoofed grandTotal ignored', spoofedSale?.grandTotal, 472);
  money('spoofed discountAmount ignored', spoofedSale?.discountAmount, 0);

  // Inter-state supply -> IGST at the full rate.
  const otherState = await api('POST', '/api/customers', {
    name: `Smoke Test Karnataka Buyer ${RUN}`,
    email: `ka-${RUN.toLowerCase()}@smoketest.in`,
    phone: '+91 90000 00005',
    city: 'Bengaluru',
    state: 'Karnataka',
    pincode: '560001',
  });
  const interState = await api('POST', '/api/sales', {
    customerId: otherState.body?.data?.id,
    items: [{ productId: product.id, quantity: 1 }],
    discountType: 'percent', discountValue: 0, taxRate: 18,
    paymentMode: 'full', paymentMethod: 'UPI',
  });
  eq('inter-state sale -> 201', interState.status, 201);
  const interInvoice = trackInvoice(interState);
  eq('inter-state taxType is IGST', interInvoice?.taxType, 'IGST');
  money('inter-state IGST is the full rate', interInvoice?.igstAmount, 72);
  eq('inter-state CGST is zero', interInvoice?.cgstAmount, 0);
  eq('inter-state SGST is zero', interInvoice?.sgstAmount, 0);

  // Validation
  const noItems = await api('POST', '/api/sales', {
    customerId: buyer.id, items: [], discountType: 'percent', discountValue: 0, taxRate: 18,
  });
  eq('sale with no items -> 422', noItems.status, 422);

  const noCustomer = await api('POST', '/api/sales', {
    customerId: 'CUST-DOES-NOT-EXIST', items: [{ productId: product.id, quantity: 1 }],
    discountType: 'percent', discountValue: 0, taxRate: 18,
  });
  eq('unknown customer -> 422', noCustomer.status, 422);

  const zeroQty = await api('POST', '/api/sales', {
    customerId: buyer.id, items: [{ productId: product.id, quantity: 0 }],
    discountType: 'percent', discountValue: 0, taxRate: 18,
  });
  eq('quantity 0 -> 422', zeroQty.status, 422);

  const overPay = await api('POST', '/api/sales', {
    customerId: buyer.id, items: [{ productId: product.id, quantity: 1 }],
    discountType: 'percent', discountValue: 0, taxRate: 18,
    paymentMode: 'partial', paymentAmount: 999999,
  });
  eq('payment above grand total -> 422', overPay.status, 422);

  const overStock = await api('POST', '/api/sales', {
    customerId: buyer.id, items: [{ productId: product.id, quantity: 100000 }],
    discountType: 'percent', discountValue: 0, taxRate: 18,
  });
  eq('quantity beyond stock -> 409', overStock.status, 409);

  // -------------------------------------------------------------------------
  section('7. Payments and derived payment status');

  // Unpaid sale -> Pending, then a partial payment -> Partial, then settle -> Paid.
  // Dated today so the 15-day term has not elapsed: an older date would be
  // legitimately Overdue rather than Pending, which is the point of the next case.
  const recentDate = new Date().toISOString().slice(0, 10);
  const creditSale = await api('POST', '/api/sales', {
    customerId: buyer.id,
    items: [{ productId: product.id, quantity: 4 }], // 4 * 400 = 1600 + 18% = 1888
    discountType: 'percent', discountValue: 0, taxRate: 18,
    paymentMode: 'none', paymentMethod: 'Bank Transfer',
    date: recentDate,
  });
  eq('credit sale -> 201', creditSale.status, 201);
  const creditInvoice = trackInvoice(creditSale);
  money('credit sale grand total', creditInvoice?.grandTotal, 1888);
  eq('unpaid invoice is Pending', creditInvoice?.paymentStatus, 'Pending');
  money('nothing paid yet', creditInvoice?.paidAmount, 0);
  money('full balance due', creditInvoice?.balanceDue, 1888);

  const partial = await api('POST', `/api/invoices/${creditInvoice.id}/payments`, {
    amount: 500, paymentMethod: 'UPI', reference: `TXN-SMOKE-1-${RUN}`,
  });
  eq('partial payment -> 201', partial.status, 201);
  const afterPartial = partial.body?.data;
  eq('status becomes Partial', afterPartial?.paymentStatus, 'Partial');
  money('paid after partial', afterPartial?.paidAmount, 500);
  money('balance after partial', afterPartial?.balanceDue, 1388);
  eq('payment list records the entry', afterPartial?.payments?.length, 1);

  const overPayInvoice = await api('POST', `/api/invoices/${creditInvoice.id}/payments`, {
    amount: 99999,
  });
  eq('payment above balance -> 422', overPayInvoice.status, 422);

  const finalPayment = await api('POST', `/api/invoices/${creditInvoice.id}/payments`, {
    amount: 1388, paymentMethod: 'Cash', reference: `TXN-SMOKE-2-${RUN}`,
  });
  eq('final payment -> 201', finalPayment.status, 201);
  eq('status becomes Paid', finalPayment.body?.data?.paymentStatus, 'Paid');
  money('fully settled', finalPayment.body?.data?.balanceDue, 0);
  eq('two payments recorded', finalPayment.body?.data?.payments?.length, 2);

  // Overdue is derived, never stored: a Jan invoice due in Jan, unpaid, is
  // overdue relative to today (2026-10) even though its stored status is PENDING.
  const oldInvoice = await api('POST', '/api/sales', {
    customerId: buyer.id,
    items: [{ productId: product.id, quantity: 1 }],
    discountType: 'percent', discountValue: 0, taxRate: 18,
    paymentMode: 'none', paymentMethod: 'UPI',
    date: '2026-01-05',
  });
  const oldNum = trackInvoice(oldInvoice)?.id;
  const fetchedOld = await api('GET', `/api/invoices/${oldNum}`);
  eq('past-due unpaid invoice reads as Overdue', fetchedOld.body?.data?.paymentStatus, 'Overdue');

  const overdueList = await api('GET', '/api/invoices?paymentStatus=Overdue&limit=100');
  check(
    'paymentStatus=Overdue filter works in SQL',
    (overdueList.body?.data ?? []).every(
      (i) => i.paymentStatus === 'Overdue' && i.balanceDue > 0
    ),
    JSON.stringify((overdueList.body?.data ?? []).map((i) => [i.id, i.dueDate, i.balanceDue, i.paymentStatus]))
  );

  // The stored enum is never 'Overdue' — verify at the SQL layer.
  const paidList = await api('GET', '/api/invoices?paymentStatus=Paid&limit=100');
  check(
    'Paid filter excludes overdue invoices',
    (paidList.body?.data ?? []).every((i) => i.balanceDue === 0),
    JSON.stringify((paidList.body?.data ?? []).map((i) => [i.id, i.balanceDue, i.paymentStatus]))
  );

  // The filter chips must agree with the filters they drive. These are separate
  // SQL statements, and a `CASE ... END AS payment_status` + `GROUP BY
  // payment_status` pair silently binds the GROUP BY to the real column — which
  // drops Overdue to 0 while the filter still returns rows.
  const counts = overdueList.body?.counts ?? {};
  check(
    'chip counts sum to the unfiltered total',
    ['Paid', 'Partial', 'Pending', 'Overdue'].reduce((n, k) => n + (counts[k] ?? 0), 0) === counts.All,
    JSON.stringify(counts)
  );
  for (const status of ['Paid', 'Partial', 'Pending', 'Overdue']) {
    const filtered = await api('GET', `/api/invoices?paymentStatus=${status}&limit=100`);
    eq(
      `chip count for "${status}" matches the filter`,
      counts[status] ?? 0,
      filtered.body?.meta?.total ?? -1
    );
  }

  // -------------------------------------------------------------------------
  section('8. Dashboard and reports');

  const summary = await api('GET', '/api/dashboard/summary');
  eq('GET /api/dashboard/summary -> 200', summary.status, 200);
  eq('dashboard summary uses the data envelope', typeof summary.body?.data, 'object');
  const metrics = summary.body?.data?.metrics;
  const requiredMetrics = [
    'totalRevenue', 'totalSalesValue', 'totalOrders', 'totalOutstanding',
    'totalProducts', 'lowStockCount', 'outOfStockCount',
    'lowStockProducts', 'outOfStockProducts', 'totalInventoryValue',
  ];
  const missing = requiredMetrics.filter((k) => metrics?.[k] === undefined);
  check(
    'dashboard returns every required metric',
    missing.length === 0,
    `missing: ${missing.join(', ')}`
  );
  check('lowStockProducts is an array', Array.isArray(metrics?.lowStockProducts));
  check('outOfStockProducts is an array', Array.isArray(metrics?.outOfStockProducts));
  check(
    'lowStockProducts only holds low_stock items',
    (metrics?.lowStockProducts ?? []).every((p) => p.status === 'low_stock')
  );
  check(
    'outOfStockProducts only holds out_of_stock items',
    (metrics?.outOfStockProducts ?? []).every((p) => p.status === 'out_of_stock')
  );

  const trend = await api('GET', '/api/reports/revenue-trend?from=2026-01-01&to=2026-01-31&granularity=day');
  eq('revenue-trend -> 200', trend.status, 200);
  check('trend is a series', Array.isArray(trend.body?.data));
  eq(
    'trend is gapless (31 days in January)',
    trend.body?.data?.length,
    31
  );
  check(
    'trend dates are strictly increasing and gapless',
    trend.body?.data?.every((p, i, arr) => i === 0 || arr[i - 1].date < p.date),
    JSON.stringify((trend.body?.data ?? []).slice(0, 4))
  );
  check(
    'quiet days are zero-filled rather than omitted',
    trend.body?.data?.some((p) => p.orders === 0 && Number(p.revenue) === 0),
    'expected at least one zero-revenue day'
  );

  const reportEndpoints = [
    '/api/reports/sales-summary',
    '/api/reports/payment-breakdown',
    '/api/reports/product-performance',
    '/api/reports/inventory-valuation',
    '/api/reports/customer-performance',
    '/api/reports/cash-flow',
    '/api/reports/receivables-aging',
  ];
  for (const path of reportEndpoints) {
    const res = await api('GET', path);
    eq(`GET ${path} -> 200`, res.status, 200);
  }

  const perf = await api('GET', '/api/reports/product-performance');
  check(
    'product performance reports revenue and profit',
    Array.isArray(perf.body?.data?.products) &&
      perf.body.data.products.every((p) => 'revenue' in p && 'profit' in p),
    JSON.stringify(perf.body?.data?.products?.[0])
  );

  const valuation = await api('GET', '/api/reports/inventory-valuation');
  check(
    'inventory valuation groups by category',
    Array.isArray(valuation.body?.data?.byCategory) && valuation.body.data.byCategory.length > 0,
    JSON.stringify(valuation.body?.data)
  );

  const ledger = await api('GET', '/api/ledger?limit=100');
  eq('GET /api/ledger -> 200', ledger.status, 200);
  check(
    'ledger entries carry display labels',
    (ledger.body?.data ?? []).every((t) => typeof t.type === 'string' && t.id.startsWith('TXN-')),
    JSON.stringify((ledger.body?.data ?? []).slice(0, 2))
  );
  check(
    'settlement payments read as "Payment Received"',
    (ledger.body?.data ?? []).some((t) => t.type === 'Payment Received'),
    JSON.stringify((ledger.body?.data ?? []).map((t) => t.type))
  );

  // -------------------------------------------------------------------------
  section('9. Concurrency: overselling must be impossible');

  // Give a product exactly enough stock for one sale.
  const raceProduct = await api('POST', '/api/products', {
    name: `Smoke Test Race Item ${RUN}`,
    sku: `SMOKE-RACE-${RUN}`,
    category: categoryId,
    mrp: 200, sellingPrice: 100, costPrice: 60,
    stockQuantity: 5, minStockLevel: 1,
  });
  const raceId = raceProduct.body?.data?.id;

  const raceBody = {
    customerId: buyer.id,
    items: [{ productId: raceId, quantity: 5 }],
    discountType: 'percent', discountValue: 0, taxRate: 18,
    paymentMode: 'full', paymentMethod: 'UPI',
  };

  // Fire both sales simultaneously; each wants all 5 units.
  const [r1, r2] = await Promise.all([
    api('POST', '/api/sales', raceBody),
    api('POST', '/api/sales', raceBody),
  ]);

  // The winner created a real invoice; the loser created nothing.
  trackInvoice(r1);
  trackInvoice(r2);

  const statuses = [r1.status, r2.status].sort();
  check(
    'exactly one concurrent sale succeeds',
    statuses[0] === 201 && statuses[1] === 409,
    `statuses were ${JSON.stringify(statuses)} (${r1.status}, ${r2.status})`
  );

  const afterRace = await api('GET', `/api/products/${raceId}`);
  eq(
    'stock landed at zero, never negative',
    afterRace.body?.data?.product?.stockQuantity,
    0
  );

  // -------------------------------------------------------------------------
  section('10. Soft delete and referential safety');

  const delProduct = await api('DELETE', `/api/products/${raceId}`);
  eq('DELETE product -> 200', delProduct.status, 200);
  eq('delete response confirms', delProduct.body?.data?.deleted, true);

  const afterDelete = await api('GET', `/api/products/${raceId}`);
  eq('soft-deleted product is gone from reads', afterDelete.status, 404);

  const delCategory = await api('DELETE', `/api/categories/${categoryId}`);
  eq(
    'deleting a category still in use -> 409',
    delCategory.status,
    409
  );
  check(
    'conflict message names the blocking count',
    typeof delCategory.body?.error?.message === 'string' &&
      /product/i.test(delCategory.body.error.message),
    JSON.stringify(delCategory.body?.error)
  );

  // -------------------------------------------------------------------------
  section('11. Role permission matrix');

  const adminToken = token;

  async function as(roleEmail) {
    const res = await api('POST', '/api/auth/login', {
      email: roleEmail,
      password: ADMIN_PASSWORD,
    });
    return { status: res.status, token: res.body?.data?.token, role: res.body?.data?.user?.role };
  }

  const manager = await as('manager@flowpilot.in');
  const cashier = await as('cashier@flowpilot.in');
  const viewer = await as('viewer@flowpilot.in');

  eq('manager can log in', manager.status, 200);
  eq('cashier can log in', cashier.status, 200);
  eq('viewer can log in', viewer.status, 200);
  eq('manager role echoed', manager.role, 'MANAGER');
  eq('cashier role echoed', cashier.role, 'CASHIER');
  eq('viewer role echoed', viewer.role, 'VIEWER');

  // Every role may read the catalogue.
  for (const who of [manager, cashier, viewer]) {
    token = who.token;
    const res = await api('GET', '/api/products?limit=1');
    eq(`${who.role} can read products`, res.status, 200);
  }

  // Only ADMIN/MANAGER may read reports.
  for (const [who, expected] of [
    [manager, 200],
    [cashier, 403],
    [viewer, 403],
  ]) {
    token = who.token;
    const res = await api('GET', '/api/reports/sales-summary');
    eq(`${who.role} reports -> ${expected}`, res.status, expected);
  }

  // Only ADMIN/MANAGER may record a payment.
  for (const [who, expected] of [
    [manager, 201],
    [cashier, 403],
    [viewer, 403],
  ]) {
    token = who.token;
    const res = await api('POST', `/api/invoices/${oldNum}/payments`, {
      amount: 10,
      paymentMethod: 'Cash',
    });
    eq(`${who.role} recording a payment -> ${expected}`, res.status, expected);
  }

  // Only ADMIN may delete a product. Created as ADMIN first, because VIEWER (the
  // last token active above) is not allowed to create products.
  token = adminToken;
  const throwaway = await api('POST', '/api/products', {
    name: `Smoke Test Disposable ${RUN}`,
    sku: `SMOKE-DISP-${RUN}`,
    category: categoryId,
    mrp: 200, sellingPrice: 150, costPrice: 100,
    stockQuantity: 5, minStockLevel: 1,
  });
  eq('ADMIN can create a product', throwaway.status, 201);
  const throwawayId = throwaway.body?.data?.id;

  for (const [who, expected] of [
    [manager, 403],
    [cashier, 403],
    [viewer, 403],
  ]) {
    token = who.token;
    const res = await api('DELETE', `/api/products/${throwawayId}`);
    eq(`${who.role} deleting a product -> ${expected}`, res.status, expected);
  }

  token = adminToken;
  const adminDelete = await api('DELETE', `/api/products/${throwawayId}`);
  eq('ADMIN deleting a product -> 200', adminDelete.status, 200);

  // -------------------------------------------------------------------------
  section('12. Documentation');

  const spec = await api('GET', '/api/openapi.json');
  eq('GET /api/openapi.json -> 200', spec.status, 200);
  check('spec declares OpenAPI 3.1', String(spec.body?.openapi ?? '').startsWith('3.1'));
  const pathCount = Object.keys(spec.body?.paths ?? {}).length;
  check('spec documents the routes', pathCount >= 25, `${pathCount} paths`);

  const docs = await fetch(`${BASE}/api/docs/`);
  eq('GET /api/docs -> 200', docs.status, 200);

  // -------------------------------------------------------------------------
  section('13. Clean up test records');

  // Invoices first: the customer/product deletes below refuse while an invoice
  // still references them, so the order here is load-bearing, not cosmetic.
  let purged = 0;
  for (const invoiceId of createdInvoices) {
    const res = await api('DELETE', `/api/invoices/${invoiceId}`);
    if (res.status === 200) purged += 1;
    else console.log(`    (could not delete invoice ${invoiceId}: ${res.status})`);
  }
  eq('every invoice this run created is deleted', purged, createdInvoices.size);
  check('the run created invoices worth cleaning up', createdInvoices.size >= 5, String(createdInvoices.size));

  const delBuyer = await api('DELETE', `/api/customers/${buyer.id}`);
  eq('DELETE customer -> 200', delBuyer.status, 200);
  const delOther = await api('DELETE', `/api/customers/${otherState.body?.data?.id}`);
  eq('DELETE second customer -> 200', delOther.status, 200);
  const delTestProduct = await api('DELETE', `/api/products/${product.id}`);
  eq('DELETE test product -> 200', delTestProduct.status, 200);
  // No delete for `raceId`/`throwawayId`: sections 10 and 11 already soft-delete
  // them, and deleting a tombstoned row again is a 404, not a 200.
  const delCategory2 = await api('DELETE', `/api/categories/${categoryId}`);
  eq('DELETE now-unused category -> 200', delCategory2.status, 200);

  // The seeded baseline must be exactly what the seeder wrote, or the report
  // assertions above were measuring residue from an earlier run.
  const leftovers = await api('GET', '/api/invoices?limit=100');
  eq('seeded invoices restored to 8', leftovers.body?.meta?.total, 8);
  const leftProducts = await api('GET', '/api/products?limit=100');
  eq('seeded products restored to 12', leftProducts.body?.meta?.total, 12);

  // -------------------------------------------------------------------------
  console.log(`\n${'='.repeat(64)}`);
  console.log(`Passed: ${passed}   Failed: ${failed}`);
  if (failed > 0) {
    console.log('\nFailures:');
    for (const f of failures) console.log(`  - ${f}`);
  }
  console.log(`${'='.repeat(64)}`);
}

run()
  .then(() => {
    process.exit(failed > 0 ? 1 : 0);
  })
  .catch((err) => {
    console.error('\nSmoke test crashed:', err);
    process.exit(1);
  });