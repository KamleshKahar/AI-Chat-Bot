import { customerRepo } from '../repositories/customer.repo.js';
import { auditRepo } from '../repositories/audit.repo.js';
import { AppError } from '../errors/AppError.js';
import { toPaymentStatusLabel } from '../lib/enums.js';
import { d } from '../lib/decimal.js';
import { toDateOnly, todayDateOnly } from '../config/prisma.js';
import { serializeCustomer } from '../serializers/index.js';

export const customerService = {
  async list(query) {
    const { rows, total } = await customerRepo.list(query);
    return { rows: rows.map(serializeCustomer), total };
  },

  async create(data, actor, { ip } = {}) {
    const row = await customerRepo.create(data);
    await auditRepo.write({
      actorUserId: actor?.id ?? null,
      action: 'CREATE',
      entityType: 'customer',
      entityId: row.code,
      after: { name: row.name, company: row.company },
      ip,
    });
    return serializeCustomer(row);
  },

  async update(idOrCode, data, actor, { ip } = {}) {
    const before = await customerRepo.resolve(idOrCode);
    if (!before) throw AppError.notFound('Customer not found');

    const row = await customerRepo.update(idOrCode, data);
    await auditRepo.write({
      actorUserId: actor?.id ?? null,
      action: 'UPDATE',
      entityType: 'customer',
      entityId: row.code,
      before: { name: before.name, phone: before.phone },
      after: { name: row.name, phone: row.phone },
      ip,
    });
    return serializeCustomer(row);
  },

  async remove(idOrCode, actor, { ip } = {}) {
    const row = await customerRepo.softDelete(idOrCode);
    await auditRepo.write({
      actorUserId: actor?.id ?? null,
      action: 'DELETE',
      entityType: 'customer',
      entityId: row.code,
      before: { name: row.name },
      ip,
    });
    return { id: row.code, deleted: true };
  },

  /** Customer + invoice history + recent payments. */
  async detail(idOrCode) {
    const customer = await customerRepo.resolve(idOrCode);
    if (!customer) throw AppError.notFound('Customer not found');

    const today = todayDateOnly();
    const history = await customerRepo.purchaseHistory(customer.id, { limit: 50 });

    return {
      customer: serializeCustomer(customer),
      purchases: history.map((inv) => ({
        invoiceNumber: inv.invoiceNumber,
        saleId: inv.saleCode,
        date: toDateOnly(inv.invoiceDate),
        dueDate: toDateOnly(inv.dueDate),
        itemCount: inv.items.length,
        grandTotal: Number(inv.grandTotal),
        paidAmount: Number(inv.paidAmount),
        balanceDue: Number(inv.balanceDue),
        paymentStatus: toPaymentStatusLabel(inv.paymentStatus, {
          dueDate: toDateOnly(inv.dueDate),
          balanceDue: d(inv.balanceDue),
          today,
        }),
      })),
    };
  },
};

export default customerService;