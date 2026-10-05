import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

const counts = {
  users: await p.user.count(),
  categories: await p.category.count({ where: { deletedAt: null } }),
  products: await p.product.count({ where: { deletedAt: null } }),
  customers: await p.customer.count({ where: { deletedAt: null } }),
  invoices: await p.invoice.count({ where: { deletedAt: null } }),
  items: await p.invoiceItem.count(),
  ledger: await p.ledgerEntry.count(),
};
console.log('live row counts (soft-deleted excluded):', JSON.stringify(counts));

const neg = await p.$queryRawUnsafe('SELECT COUNT(*) AS n FROM products WHERE stock_quantity < 0');
console.log('negative stock rows:', String(neg[0].n));

const bad = await p.$queryRawUnsafe(
  "SELECT COUNT(*) AS n FROM invoices WHERE payment_status NOT IN ('PENDING','PARTIAL','PAID')"
);
console.log('invoices storing a non-derivable status:', String(bad[0].n));

const unbalanced = await p.$queryRawUnsafe(
  `SELECT invoice_number, cgst_amount, sgst_amount, igst_amount FROM invoices
   WHERE deleted_at IS NULL AND (
     (igst_amount > 0 AND (cgst_amount <> 0 OR sgst_amount <> 0))
     OR (igst_amount = 0 AND cgst_amount <> sgst_amount)
   )`
);
console.log('GST split violations:', unbalanced.length === 0 ? 'none' : JSON.stringify(unbalanced));

const invoices = await p.invoice.findMany({
  where: { deletedAt: null },
  orderBy: { invoiceNumber: 'asc' },
  select: {
    invoiceNumber: true, subtotal: true, discountAmount: true, taxAmount: true,
    shippingCharges: true, grandTotal: true, paidAmount: true, balanceDue: true,
    cgstAmount: true, sgstAmount: true, igstAmount: true, paymentStatus: true,
  },
});
console.log('\ninvoice money (authoritative, DECIMAL(14,2)):');
for (const i of invoices) {
  const kind = Number(i.igstAmount) > 0 ? 'IGST' : 'CGST+SGST';
  console.log(
    `  ${i.invoiceNumber}  sub=${i.subtotal}  disc=${i.discountAmount}  tax=${i.taxAmount}` +
    `  ship=${i.shippingCharges}  grand=${i.grandTotal}  paid=${i.paidAmount}` +
    `  due=${i.balanceDue}  [${i.paymentStatus}]  ${kind}`
  );
}

const implied = await p.$queryRawUnsafe(
  `SELECT COUNT(*) AS n FROM invoices WHERE deleted_at IS NULL
     AND grand_total <> taxable_amount + tax_amount + shipping_charges`
);
console.log('\ninvoices where grand_total <> taxable + tax + shipping:', String(implied[0].n));

await p.$disconnect();
