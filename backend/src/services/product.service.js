import { prisma, toUtcDate, todayDateOnly } from '../config/prisma.js';
import { AppError } from '../errors/AppError.js';
import { auditRepo } from '../repositories/audit.repo.js';
import { categoryRepo } from '../repositories/category.repo.js';
import { productRepo } from '../repositories/product.repo.js';
import { stockRepo } from '../repositories/stock.repo.js';
import { SEQ, nextCode } from '../lib/codes.js';
import { d } from '../lib/decimal.js';
import { toPaymentMethodEnum } from '../lib/enums.js';
import {
  serializeProduct,
  serializeStockMovement,
} from '../serializers/index.js';

export const productService = {
  async list(query) {
    const { rows, total } = await productRepo.list(query);
    return { rows: rows.map(serializeProduct), total };
  },

  /** Filter-chip counts, computed by the same SQL status expression as the list. */
  async statusCounts() {
    return productRepo.statusCounts();
  },

  async create(data, actor, { ip } = {}) {
    const category = await productRepo.resolveCategory(data.category);
    const { category: _ignored, ...rest } = data;

    const row = await prisma.$transaction(async (tx) => {
      const created = await productRepo.create(
        {
          ...rest,
          mrp: d(rest.mrp),
          sellingPrice: d(rest.sellingPrice),
          costPrice: d(rest.costPrice),
          taxRate: d(rest.taxRate ?? 18),
          stockQuantity: Number(rest.stockQuantity ?? 0),
          minStockLevel: Number(rest.minStockLevel ?? 10),
          categoryId: category.id,
        },
        tx
      );

      // Opening stock is a real movement, so `stock_quantity` always reconciles.
      if (created.stockQuantity > 0) {
        await tx.stockMovement.create({
          data: {
            productId: created.id,
            type: 'OPENING',
            quantityDelta: created.stockQuantity,
            stockAfter: created.stockQuantity,
            unitCost: created.costPrice,
            referenceType: 'ADJUSTMENT',
            referenceId: created.code,
            reason: 'Opening stock',
            createdById: actor?.id ?? null,
          },
        });
      }
      return created;
    });

    await auditRepo.write({
      actorUserId: actor?.id ?? null,
      action: 'CREATE',
      entityType: 'product',
      entityId: row.code,
      after: { name: row.name, sku: row.sku, stock: row.stockQuantity },
      ip,
    });

    return serializeProduct(row);
  },

  async update(idOrCode, data, actor, { ip } = {}) {
    const existing = await productRepo.resolve(idOrCode);
    if (!existing) throw AppError.notFound('Product not found');

    let categoryId = existing.categoryId;
    if (data.category !== undefined && data.category !== existing.code && data.category !== existing.name) {
      const category = await productRepo.resolveCategory(data.category);
      categoryId = category.id;
    }

    const { category: _ignored, ...rest } = data;
    const row = await productRepo.update(idOrCode, {
      ...rest,
      ...(rest.mrp !== undefined ? { mrp: d(rest.mrp) } : {}),
      ...(rest.sellingPrice !== undefined ? { sellingPrice: d(rest.sellingPrice) } : {}),
      ...(rest.costPrice !== undefined ? { costPrice: d(rest.costPrice) } : {}),
      ...(rest.taxRate !== undefined ? { taxRate: d(rest.taxRate) } : {}),
      ...(rest.minStockLevel !== undefined ? { minStockLevel: Number(rest.minStockLevel) } : {}),
      ...(data.category !== undefined ? { categoryId } : {}),
    });

    await auditRepo.write({
      actorUserId: actor?.id ?? null,
      action: 'UPDATE',
      entityType: 'product',
      entityId: row.code,
      before: { name: existing.name, sellingPrice: String(existing.sellingPrice) },
      after: { name: row.name, sellingPrice: String(row.sellingPrice) },
      ip,
    });

    return serializeProduct(row);
  },

  async remove(idOrCode, actor, { ip } = {}) {
    const existing = await productRepo.resolve(idOrCode);
    if (!existing) throw AppError.notFound('Product not found');

    const row = await productRepo.softDelete(idOrCode);
    await auditRepo.write({
      actorUserId: actor?.id ?? null,
      action: 'DELETE',
      entityType: 'product',
      entityId: row.code,
      before: { name: existing.name },
      ip,
    });
    return { id: row.code, deleted: true };
  },

  /** Product + sales performance + recent movements. */
  async detail(idOrCode, { from, to } = {}) {
    const product = await productRepo.resolve(idOrCode);
    if (!product) throw AppError.notFound('Product not found');

    const [performance, history, movements] = await Promise.all([
      productRepo.performance(product.id, { from, to }),
      productRepo.salesHistory(product.id, { from, to }),
      stockRepo.listForProduct(product.id, { limit: 20 }),
    ]);

    const unitsSold = performance.unitsSold;
    const revenue = Number(d(performance.revenue));
    const cost = unitsSold * Number(product.costPrice);
    const profit = revenue - cost;

    // Average daily units sold over the window, used for stock-cover days.
    const days = from && to
      ? Math.max(1, Math.round((new Date(`${to}T00:00:00Z`) - new Date(`${from}T00:00:00Z`)) / 86_400_000) + 1)
      : 30;
    const dailyUnits = unitsSold / days;

    return {
      product: serializeProduct(product),
      performance: {
        unitsSold,
        revenue,
        profit,
        marginPercent: revenue > 0 ? Math.round((profit / revenue) * 100) : 0,
        taxCollected: Number(d(performance.taxCollected)),
        invoices: performance.invoices,
        avgDailyUnits: Math.round(dailyUnits * 100) / 100,
        // Days of stock left at the recent run rate.
        stockCoverDays: dailyUnits > 0 ? Math.round(product.stockQuantity / dailyUnits) : null,
        potentialRevenue: product.stockQuantity * Number(product.sellingPrice),
      },
      salesHistory: history.map((h) => ({
        invoiceNumber: h.invoice_number,
        saleId: h.sale_code,
        // Already YYYY-MM-DD: the repo formats it in SQL rather than handing back
        // a JS Date, so no date parsing is needed here.
        date: h.invoice_date,
        // Frozen snapshot, not a live join to `customers`: an invoice must keep
        // showing the customer it was issued to even after they are renamed.
        customerName: h.customer_name,
        quantity: Number(h.quantity),
        unitPrice: Number(h.unit_price),
        lineTotal: Number(h.line_total),
        taxRate: Number(h.tax_rate),
      })),
      movements: movements.map(serializeStockMovement),
    };
  },

  /**
   * Manual stock adjustment.
   *
   * Runs in one transaction: row lock, guard, decrement, movement row with the
   * resulting level, and a cash-ledger row valued at cost (stock bought in, or
   * written off).
   */
  async adjustStock(idOrCode, { mode, quantity, reason, notes }, actor, { ip } = {}) {
    const existing = await productRepo.resolve(idOrCode);
    if (!existing) throw AppError.notFound('Product not found');

    const qty = Number(quantity);
    const delta = mode === 'add' ? qty : -qty;

    const result = await prisma.$transaction(async (tx) => {
      const locked = await productRepo.lockById(existing.id, tx);
      if (!locked) throw AppError.notFound('Product not found');

      const available = locked.stockQuantity;
      if (delta < 0 && Math.abs(delta) > available) {
        throw AppError.conflict(
          `Cannot remove ${Math.abs(delta)} unit(s); only ${available} in stock`,
          { details: { available: `${available} unit(s) in stock`, requested: `${Math.abs(delta)} unit(s) requested` } }
        );
      }

      const after = available + delta;
      await productRepo.applyStockDelta(existing.id, delta, tx);

      await tx.stockMovement.create({
        data: {
          productId: existing.id,
          type: mode === 'add' ? 'ADJUSTMENT_IN' : 'ADJUSTMENT_OUT',
          quantityDelta: delta,
          stockAfter: after,
          unitCost: existing.costPrice,
          referenceType: 'ADJUSTMENT',
          referenceId: existing.code,
          reason: reason ?? 'Manual adjustment',
          notes: notes ?? null,
          createdById: actor?.id ?? null,
        },
      });

      // Cash ledger entry valued at cost price.
      const entryCode = await nextCode(tx, SEQ.LEDGER);
      await tx.ledgerEntry.create({
        data: {
          entryCode,
          entryDate: toUtcDate(todayDateOnly()),
          direction: delta > 0 ? 'IN' : 'OUT',
          type: 'ADJUSTMENT',
          amount: d(qty).mul(existing.costPrice),
          paymentMethod: toPaymentMethodEnum('Bank Transfer') ?? 'BANK_TRANSFER',
          reference: `ADJ-${existing.sku}`,
          status: 'SUCCESS',
          notes: reason ?? 'Manual stock adjustment',
        },
      });

      await auditRepo.write(
        {
          actorUserId: actor?.id ?? null,
          action: 'STOCK_ADJUST',
          entityType: 'product',
          entityId: existing.code,
          before: { stockQuantity: available },
          after: { stockQuantity: after, delta, reason: reason ?? null },
          ip,
        },
        tx
      );

      return { before: available, after, delta };
    });

    const updated = await productRepo.resolve(existing.code);
    return {
      product: serializeProduct(updated),
      movement: {
        quantityDelta: result.delta,
        stockBefore: result.before,
        stockAfter: result.after,
        stockValue: Number(d(qty).mul(existing.costPrice)),
      },
    };
  },

  async categories() {
    return categoryRepo.listAll().then((rows) =>
      rows.map((r) => ({ id: r.code, code: r.code, name: r.name }))
    );
  },
};

export default productService;