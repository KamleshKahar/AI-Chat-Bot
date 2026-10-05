import { prisma, toUtcDate } from '../config/prisma.js';
import { authService } from './auth.service.js';
import { auditRepo } from '../repositories/audit.repo.js';
import { computeInvoiceTotals, resolvePaymentStatusEnum } from '../lib/billing.js';
import { resolveTaxType } from '../lib/gst.js';
import { d, money } from '../lib/decimal.js';
import { toPaymentMethodEnum } from '../lib/enums.js';

/**
 * Demo dataset seeder.
 *
 * Mirrors frontend/data/mock/initialData.js so a seeded database looks exactly
 * like the localStorage-backed frontend did: same company details, same
 * categories, same 12 products, same 8 customers, same 8 sales and their
 * invoices, same 7 ledger entries — and, crucially, the same document codes
 * (PRD-101, CUST-001, INV-2026-001, TXN-901) so screenshots and printouts match.
 *
 * Invoices are re-derived through the real billing engine rather than copied
 * from the mock file, which doubles as a correctness check: if the engine and
 * the frontend formula ever disagree, the seed totals would move.
 */

const COMPANY = {
  name: 'FlowPilot Solutions Pvt Ltd',
  tagline: 'Smart Sales & Inventory Infrastructure',
  gstin: '27AABCF1234F1Z8',
  pan: 'AABCF1234F',
  email: 'billing@flowpilot.in',
  phone: '+91 98200 12345',
  address: 'Unit 402, Trade Center, Bandra Kurla Complex (BKC)',
  city: 'Mumbai',
  state: 'Maharashtra',
  pincode: '400051',
  bankName: 'HDFC Bank Ltd',
  bankAccount: '50200012345678',
  ifscCode: 'HDFC0000240',
  upiId: 'flowpilot@hdfcbank',
  invoicePrefix: 'INV',
  invoiceTerms:
    '1. Payment is due within 15 days of invoice date.\n' +
    '2. Interest @ 18% p.a. will be charged on overdue payments.\n' +
    '3. Goods once sold will not be returned unless manufacturing defect is notified within 48 hours.',
  paymentTermDays: 15,
};

const CATEGORIES = [
  ['CAT-01', 'ELEC', 'Electronics & Peripherals', 'Computer hardware, barcode scanners, and IT equipment'],
  ['CAT-02', 'OFFC', 'Office Stationery & Supplies', 'Paper, printing consumables, folders, and desk supplies'],
  ['CAT-03', 'INDT', 'Industrial & Tools', 'Measuring gauges, hand tools, maintenance accessories'],
  ['CAT-04', 'PACK', 'Packaging & Shipping', 'Corrugated cartons, bubble rolls, adhesive tapes'],
  ['CAT-05', 'ELEC-PWR', 'Electrical & Power', 'UPS units, surge protectors, cabling and connectors'],
  ['CAT-06', 'SAFE', 'Safety & PPE Gear', 'Helmets, safety gloves, protective eye goggles'],
];

// [code, sku, name, categoryCode, mrp, selling, cost, stock, minStock, unit, tax, description]
const PRODUCTS = [
  ['PRD-101', 'ELEC-BC-01', 'Wireless 2D Handheld Barcode Scanner', 'CAT-01', 4499, 3850, 2600, 42, 15, 'pcs', 18, 'High-speed 2.4GHz wireless QR and barcode reader with USB cradle'],
  ['PRD-102', 'ELEC-PR-02', 'Thermal Receipt Printer 80mm USB+LAN', 'CAT-01', 7999, 6890, 4800, 18, 10, 'pcs', 18, 'Heavy-duty commercial thermal receipt printer with auto-cutter'],
  ['PRD-103', 'INDT-WS-03', 'Digital Electronic Weighing Scale 30Kg', 'CAT-03', 3200, 2650, 1750, 8, 12, 'pcs', 18, 'Precision bench-top digital scale with dual red LED display'],
  ['PRD-104', 'OFFC-TR-04', 'Thermal Paper Rolls 80mm x 50m (Box of 50)', 'CAT-02', 2400, 1950, 1300, 65, 25, 'box', 12, 'BPA-free thermal paper rolls for POS billing machines'],
  ['PRD-105', 'PACK-BX-05', 'Heavy Duty Corrugated Boxes 12x10x8 inch (Pack of 100)', 'CAT-04', 3600, 2950, 2000, 120, 30, 'pack', 18, '3-ply sturdy corrugated kraft cardboard boxes for e-commerce dispatch'],
  ['PRD-106', 'OFFC-LB-06', 'Self-Adhesive Shipping Labels A4 24-up (100 Sheets)', 'CAT-02', 850, 620, 380, 4, 20, 'pack', 12, 'Matte white label sheets compatible with laser and inkjet printers'],
  ['PRD-107', 'PACK-SW-07', 'Industrial Stretch Wrap Film 500mm x 300m', 'CAT-04', 750, 580, 390, 84, 20, 'rolls', 18, '23-micron stretchable pallet wrapping plastic film roll'],
  ['PRD-108', 'ELEC-UPS-08', 'Online Line-Interactive UPS 1100VA / 660W', 'CAT-05', 6500, 5400, 4100, 2, 8, 'pcs', 18, 'Microprocessor-controlled battery backup for POS terminals & routers'],
  ['PRD-109', 'PACK-TD-09', 'Automatic BOPP Tape Dispenser Machine', 'CAT-04', 14500, 11900, 8500, 0, 5, 'pcs', 18, 'Carrousel automated electric adhesive tape cutting machine'],
  ['PRD-110', 'SAFE-GL-10', 'Industrial Safety Leather Work Gloves (Pack of 12)', 'CAT-06', 1800, 1350, 850, 55, 15, 'pack', 12, 'Cow split leather heavy-duty abrasion resistant handling gloves'],
  ['PRD-111', 'SAFE-HL-11', 'High-Visibility Safety Helmet with Ratchet', 'CAT-06', 550, 420, 260, 6, 15, 'pcs', 18, 'ISI certified industrial head protection safety helmet'],
  ['PRD-112', 'INDT-MT-12', 'Steel Measuring Tape 10 Meters Heavy Duty', 'CAT-03', 490, 380, 220, 95, 20, 'pcs', 18, 'Impact-resistant rubberized casing with double-sided metric marking'],
];

const CUSTOMERS = [
  ['CUST-001', 'Rajesh Sharma', 'Apex Retail Mart Pvt Ltd', 'rajesh.sharma@apexretail.in', '+91 98201 54321', 'Shop 14, High Street Mall, Senapati Bapat Marg, Lower Parel', 'Mumbai', 'Maharashtra', '400013', '27AAACA1234D1Z2', 18500, 'active', '2025-02-15'],
  ['CUST-002', 'Priya Sundaram', 'Sundaram Logistics & Warehousing', 'priya@sundaramlogistics.com', '+91 98410 76543', 'Warehouse Block C, Ambattur Industrial Estate', 'Chennai', 'Tamil Nadu', '600058', '33AABCS4567E1ZM', 0, 'active', '2025-01-20'],
  ['CUST-003', 'Vikramaditya Rao', 'Deccan Hardware & Electricals', 'vikram@deccanhardware.in', '+91 94401 23456', 'D.No 4-1-890, Tilak Road, Abids', 'Hyderabad', 'Telangana', '500001', '36AACCD9876K1ZA', 42000, 'active', '2025-03-10'],
  ['CUST-004', 'Kavita Verma', 'Kavita Superstores Chain', 'kavita.v@superstores.co.in', '+91 98103 98712', 'Plot 88, Sector 18, Commercial Belt', 'Noida', 'Uttar Pradesh', '201301', '09AAECV3456J1ZR', 12500, 'active', '2025-04-05'],
  ['CUST-005', 'Amit Deshmukh', 'Deshmukh Agro-Tech Enterprises', 'amit@deshmukh-agro.com', '+91 98500 44332', 'Gat No 214, Pune-Nashik Highway, Bhosari MIDC', 'Pune', 'Maharashtra', '411026', '27AABCD6789P1ZK', 0, 'active', '2025-05-18'],
  ['CUST-006', 'Neha Gupta', 'Zenith Global Exports', 'accounts@zenithexports.in', '+91 97112 88990', 'Level 3, DLF Cyber City, Tower B', 'Gurugram', 'Haryana', '122002', '06AAGCZ1122H1ZT', 85000, 'active', '2025-01-12'],
  ['CUST-007', 'Rohan Kulkarni', 'Kulkarni Electronics Hub', 'rohan@kulkarnihub.com', '+91 98860 11223', 'SP Road Electronic Market, Cross 2', 'Bengaluru', 'Karnataka', '560002', '29AABCK3344M1ZQ', 0, 'active', '2025-06-01'],
  ['CUST-008', 'Ananya Banerjee', 'Bengal Craft & Packaging Co', 'ananya@bengalpackaging.org', '+91 98300 55667', '12 Brabourne Road, Dalhousie Area', 'Kolkata', 'West Bengal', '700001', '19AABCB5566F1ZL', 14200, 'inactive', '2025-07-22'],
];

// [invoiceNumber, saleCode, date, customerCode, discountPercent, taxRate, paidAmount, paymentMethod, notes, lines]
const SALES = [
  ['INV-2026-001', 'SALE-1001', '2026-10-03', 'CUST-001', 5, 18, 21635.3, 'UPI', 'Express delivery to Lower Parel showroom.',
    [['PRD-101', 4, 3850], ['PRD-104', 2, 1950]]],
  ['INV-2026-002', 'SALE-1002', '2026-10-02', 'CUST-002', 8, 18, 60630.76, 'Bank Transfer', 'Dispatched via V-Trans consignment.',
    [['PRD-105', 15, 2950], ['PRD-107', 20, 580]]],
  ['INV-2026-003', 'SALE-1003', '2026-10-01', 'CUST-006', 10, 18, 30000, 'Bank Transfer', 'Advance 30,000 received. Balance within 15 days.',
    [['PRD-102', 5, 6890], ['PRD-108', 3, 5400], ['PRD-110', 10, 1350]]],
  ['INV-2026-004', 'SALE-1004', '2026-09-28', 'CUST-003', 0, 18, 0, 'Credit Card', '30-day payment term exceeded. Follow-up reminder sent.',
    [['PRD-103', 4, 2650], ['PRD-112', 30, 380]]],
  ['INV-2026-005', 'SALE-1005', '2026-09-25', 'CUST-004', 5, 18, 24079.08, 'UPI', 'Payment cleared via Razorpay UPI.',
    [['PRD-101', 2, 3850], ['PRD-102', 2, 6890]]],
  ['INV-2026-006', 'SALE-1006', '2026-09-20', 'CUST-005', 0, 18, 22656, 'Cash', 'Direct counter pickup at warehouse.',
    [['PRD-111', 20, 420], ['PRD-110', 8, 1350]]],
  ['INV-2026-007', 'SALE-1007', '2026-09-15', 'CUST-007', 7, 18, 32153.82, 'Bank Transfer', 'NEFT transaction confirmed.',
    [['PRD-101', 6, 3850], ['PRD-106', 10, 620]]],
  ['INV-2026-008', 'SALE-1008', '2026-09-10', 'CUST-008', 0, 18, 13648, 'UPI', 'Balance ₹14,200 pending clearance.',
    [['PRD-105', 8, 2950]]],
];

// [code, date, direction, type, amount, method, reference, customerCode|null, supplier|null, isSettlement]
const LEDGER = [
  ['TXN-901', '2026-10-03', 'IN', 'SALE_PAYMENT', 21635.3, 'UPI', 'INV-2026-001', 'CUST-001', null, false],
  ['TXN-902', '2026-10-02', 'IN', 'SALE_PAYMENT', 60630.76, 'Bank Transfer', 'INV-2026-002', 'CUST-002', null, false],
  ['TXN-903', '2026-10-01', 'IN', 'SALE_PAYMENT', 30000, 'Bank Transfer', 'INV-2026-003', 'CUST-006', null, false],
  ['TXN-904', '2026-09-25', 'IN', 'SALE_PAYMENT', 24079.08, 'UPI', 'INV-2026-005', 'CUST-004', null, false],
  ['TXN-905', '2026-09-20', 'IN', 'SALE_PAYMENT', 22656, 'Cash', 'INV-2026-006', 'CUST-005', null, false],
  ['TXN-906', '2026-09-18', 'OUT', 'PURCHASE_PAYMENT', 84500, 'Bank Transfer', 'PO-4091', null, 'Apex Tech Distributors', false],
  ['TXN-907', '2026-09-15', 'IN', 'SALE_PAYMENT', 32153.82, 'Bank Transfer', 'INV-2026-007', 'CUST-007', null, false],
];

/** Order matters for children before parents. */
const MODELS_IN_DEPENDENCY_ORDER = [
  'auditLog', 'ledgerEntry', 'stockMovement', 'payment',
  'invoiceItem', 'invoice', 'product', 'customer', 'category', 'user',
  'documentSequence', 'companyProfile',
];

export const seedService = {
  /** Wipe every table. Intended for local/dev seeding only. */
  async reset() {
    for (const model of MODELS_IN_DEPENDENCY_ORDER) {
      await prisma[model].deleteMany({});
    }
  },

  async run({ log = console.log } = {}) {
    log('Seeding FlowPilot demo data…');
    await this.reset();
    let paymentSeq = 1;

    // ---- company ----------------------------------------------------------
    const company = await prisma.companyProfile.create({ data: COMPANY });
    log(`  company        ${company.name}`);

    // ---- users, one per role -----------------------------------------------
    // The role matrix is a real part of the contract (only ADMIN deletes
    // products, only ADMIN/MANAGER record payments or read reports), so each
    // role gets a login. Without these the permission rules are untestable.
    const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'flowpilot123';
    const admin = await prisma.user.create({
      data: {
        email: process.env.SEED_ADMIN_EMAIL ?? 'admin@flowpilot.in',
        passwordHash: await authService.hashPassword(adminPassword),
        name: process.env.SEED_ADMIN_NAME ?? 'Kamlesh Patel',
        role: 'ADMIN',
        isActive: true,
      },
    });

    for (const role of ['MANAGER', 'CASHIER', 'VIEWER']) {
      await prisma.user.create({
        data: {
          email: `${role.toLowerCase()}@flowpilot.in`,
          passwordHash: await authService.hashPassword(adminPassword),
          name: `${role[0]}${role.slice(1).toLowerCase()} User`,
          role,
          isActive: true,
        },
      });
    }
    log(`  users          4 (admin + manager + cashier + viewer)`);

    // ---- categories -------------------------------------------------------
    const categoryByCode = new Map();
    for (const [code, shortCode, name, description] of CATEGORIES) {
      const row = await prisma.category.create({
        data: { code, shortCode, name, description },
      });
      categoryByCode.set(code, row);
    }
    log(`  categories     ${categoryByCode.size}`);

    // ---- products ---------------------------------------------------------
    //
    // The mock dataset's `stockQuantity` is the level AFTER the demo sales have
    // been applied. Because the seeder then replays those sales as real stock
    // movements, the opening figure has to be `final + sold` — otherwise the
    // replay drives stock negative and the seeded dataset contradicts itself.
    const soldByProduct = new Map();
    for (const [, , , , , , , , , lines] of SALES) {
      for (const [productCode, quantity] of lines) {
        soldByProduct.set(productCode, (soldByProduct.get(productCode) ?? 0) + quantity);
      }
    }

    const productByCode = new Map();
    /** Live stock level per product code, so the replay below can self-check. */
    const runningStock = new Map();
    for (const [code, sku, name, catCode, mrp, selling, cost, finalStock, minStock, unit, tax, description] of PRODUCTS) {
      const openingStock = finalStock + (soldByProduct.get(code) ?? 0);

      const row = await prisma.product.create({
        data: {
          code,
          sku,
          name,
          categoryId: categoryByCode.get(catCode).id,
          description,
          unit,
          mrp: d(mrp),
          sellingPrice: d(selling),
          costPrice: d(cost),
          taxRate: d(tax),
          stockQuantity: openingStock,
          minStockLevel: minStock,
        },
      });
      productByCode.set(code, row);
      runningStock.set(code, openingStock);

      await prisma.stockMovement.create({
        data: {
          productId: row.id,
          type: 'OPENING',
          quantityDelta: openingStock,
          stockAfter: openingStock,
          unitCost: d(cost),
          referenceType: 'ADJUSTMENT',
          referenceId: code,
          reason: 'Opening stock (demo dataset)',
        },
      });
    }
    log(`  products       ${productByCode.size}`);

    // ---- customers --------------------------------------------------------
    const customerByCode = new Map();
    for (const [code, name, comp, email, phone, address, city, state, pincode, gstin, opening, status, joined] of CUSTOMERS) {
      const row = await prisma.customer.create({
        data: {
          code,
          name,
          company: comp,
          email,
          phone,
          address,
          city,
          state,
          pincode,
          gstin,
          openingBalance: d(opening),
          status,
          joinedAt: toUtcDate(joined),
        },
      });
      customerByCode.set(code, row);
    }
    log(`  customers      ${customerByCode.size}`);

    // ---- invoices (re-derived through the billing engine) ------------------
    const invoiceByNumber = new Map();
    for (const [
      invoiceNumber, saleCode, date, customerCode,
      discountPercent, taxRate, paidAmount, paymentMethod, notes, lines,
    ] of SALES) {
      const customer = customerByCode.get(customerCode);
      const taxType = resolveTaxType(company, customer);

      const totals = computeInvoiceTotals({
        items: lines.map(([productCode, quantity, unitPrice]) => ({
          productId: productCode,
          quantity,
          unitPrice,
        })),
        discountType: 'percent',
        discountValue: discountPercent,
        taxRate,
        shippingCharges: 0,
        taxType,
        resolvedProducts: lines.map(([productCode]) => productByCode.get(productCode)),
      });

      const paid = money(paidAmount);
      const balanceDue = money(totals.grandTotal.minus(paid));
      const dueDate = addDaysIso(date, company.paymentTermDays);

      const invoice = await prisma.invoice.create({
        data: {
          invoiceNumber,
          saleCode,
          customerId: customer.id,
          invoiceDate: toUtcDate(date),
          dueDate: toUtcDate(dueDate),
          subtotal: totals.subtotal,
          discountType: 'percent',
          discountValue: d(discountPercent),
          discountPercent: totals.discountPercent,
          discountAmount: totals.discountAmount,
          taxableAmount: totals.taxableAmount,
          taxType: totals.taxType,
          taxRate: d(taxRate),
          cgstAmount: totals.cgstAmount,
          sgstAmount: totals.sgstAmount,
          igstAmount: totals.igstAmount,
          taxAmount: totals.taxAmount,
          shippingCharges: totals.shippingCharges,
          grandTotal: totals.grandTotal,
          paidAmount: paid,
          balanceDue,
          // Overdue is never persisted — only PENDING / PARTIAL / PAID.
          paymentStatus: resolvePaymentStatusEnum(totals.grandTotal, paid),
          paymentMethod: toPaymentMethodEnum(paymentMethod) ?? 'UPI',
          status: 'CONFIRMED',
          notes,
          terms: company.invoiceTerms,
          snapshotName: customer.name,
          snapshotCompany: customer.company,
          snapshotEmail: customer.email,
          snapshotPhone: customer.phone,
          snapshotAddress: customer.address,
          snapshotCity: customer.city,
          snapshotState: customer.state,
          snapshotPincode: customer.pincode,
          snapshotGstin: customer.gstin,
          createdById: admin.id,
          items: {
            create: totals.lines.map((line, index) => ({
              productId: line.productId,
              productName: line.productName,
              sku: line.sku,
              unit: line.unit,
              hsnCode: line.hsnCode,
              quantity: line.quantity,
              unitPrice: line.unitPrice,
              discountAmount: line.discountAmount,
              taxableValue: line.taxableValue,
              taxRate: d(taxRate),
              cgstAmount: line.cgstAmount,
              sgstAmount: line.sgstAmount,
              igstAmount: line.igstAmount,
              lineTotal: line.lineTotal,
              sortOrder: index,
            })),
          },
        },
      });
      invoiceByNumber.set(invoiceNumber, invoice);

      // Payment row
      if (paid.greaterThan(0)) {
        await prisma.payment.create({
          data: {
            paymentCode: `PAY-${String(paymentSeq++).padStart(4, '0')}`,
            invoiceId: invoice.id,
            customerId: customer.id,
            amount: paid,
            paymentMethod: toPaymentMethodEnum(paymentMethod) ?? 'UPI',
            paidAt: toUtcDate(date),
            notes: 'Payment received at point of sale (demo dataset)',
            createdById: admin.id,
          },
        });
      }

      // Stock movements + decrement
      for (const [productCode, quantity] of lines) {
        const product = productByCode.get(productCode);

        // Track the running level in memory: a product can appear on several
        // invoices, so the creation-time figure is stale by the second sale.
        const stockBefore = runningStock.get(productCode);
        const stockAfter = stockBefore - quantity;
        if (stockAfter < 0) {
          throw new Error(
            `Seed data would drive ${productCode} negative (${stockBefore} - ${quantity}). ` +
              'The PRODUCTS stock figures must be the post-sale levels.'
          );
        }
        runningStock.set(productCode, stockAfter);

        await prisma.product.update({
          where: { id: product.id },
          data: { stockQuantity: stockAfter },
        });
        await prisma.stockMovement.create({
          data: {
            productId: product.id,
            type: 'SALE',
            quantityDelta: -quantity,
            stockAfter,
            unitCost: product.costPrice,
            referenceType: 'INVOICE',
            referenceId: invoiceNumber,
            reason: `Sale ${invoiceNumber}`,
            createdById: admin.id,
          },
        });
      }
    }
    log(`  invoices       ${invoiceByNumber.size}`);

    // ---- self-check: stock must land exactly on the mock figures ----------
    const seeded = await prisma.product.findMany({
      where: { deletedAt: null },
      select: { code: true, stockQuantity: true },
    });
    const mismatches = seeded.filter(
      (p) => p.stockQuantity !== runningStock.get(p.code)
    );
    if (mismatches.length > 0) {
      throw new Error(
        `Seed stock mismatch: ${mismatches
          .map((p) => `${p.code}=${p.stockQuantity} (expected ${runningStock.get(p.code)})`)
          .join(', ')}`
      );
    }

    // ---- cash ledger ------------------------------------------------------
    for (const [code, date, direction, type, amount, method, reference, customerCode, supplier, isSettlement] of LEDGER) {
      await prisma.ledgerEntry.create({
        data: {
          entryCode: code,
          entryDate: toUtcDate(date),
          direction,
          type,
          amount: d(amount),
          paymentMethod: toPaymentMethodEnum(method) ?? 'BANK_TRANSFER',
          reference,
          customerId: customerCode ? customerByCode.get(customerCode).id : null,
          invoiceId: reference?.startsWith('INV-') ? invoiceByNumber.get(reference)?.id ?? null : null,
          supplierName: supplier,
          status: 'SUCCESS',
          isSettlement,
        },
      });
    }
    log(`  ledger entries ${LEDGER.length}`);

    // ---- counters: resume where the demo data left off ---------------------
    const years = [...new Set(SALES.map(([, , date]) => date.slice(0, 4)))];
    for (const year of years) {
      const maxSeq = Math.max(
        0,
        ...SALES.filter(([, , date]) => date.startsWith(year)).map(([inv]) =>
          Number(inv.split('-')[2])
        )
      );
      await prisma.documentSequence.upsert({
        where: { prefix_period: { prefix: 'INV', period: year } },
        create: { prefix: 'INV', period: year, lastNumber: maxSeq },
        update: { lastNumber: maxSeq },
      });
    }
    await prisma.documentSequence.createMany({
      data: [
        { prefix: 'PRD-', period: 'ALL', lastNumber: 112 },
        { prefix: 'CUST-', period: 'ALL', lastNumber: 8 },
        { prefix: 'CAT-', period: 'ALL', lastNumber: 6 },
        { prefix: 'SALE-', period: 'ALL', lastNumber: 1008 },
        { prefix: 'PAY-', period: 'ALL', lastNumber: paymentSeq - 1 },
        { prefix: 'TXN-', period: 'ALL', lastNumber: 907 },
      ],
    });

    await auditRepo.write({
      actorUserId: admin.id,
      action: 'SEED',
      entityType: 'system',
      entityId: 'demo',
      after: {
        categories: CATEGORIES.length,
        products: PRODUCTS.length,
        customers: CUSTOMERS.length,
        invoices: SALES.length,
        ledger: LEDGER.length,
      },
    });

    log('Seed complete.');
    return {
      company: company.name,
      admin: admin.email,
      categories: CATEGORIES.length,
      products: PRODUCTS.length,
      customers: CUSTOMERS.length,
      invoices: SALES.length,
      ledger: LEDGER.length,
    };
  },
};

function addDaysIso(date, days) {
  const base = new Date(`${date}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

export default seedService;