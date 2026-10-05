import { invoiceService } from '../services/invoice.service.js';
import { saleService } from '../services/sale.service.js';
import { paginate, parsePaging } from '../lib/pagination.js';
import { toPaymentMethodEnum } from '../lib/enums.js';
import { vBody, vParams, vQuery } from '../middleware/validate.js';

export const saleController = {
  async list(req, res) {
    const query = vQuery(req);
    const paging = parsePaging(query);

    const { rows, total } = await saleService.list({
      search: query.search,
      paymentStatus: query.paymentStatus,
      // Accepts 'Bank Transfer' or 'BANK_TRANSFER'.
      paymentMethod: query.paymentMethod ? toPaymentMethodEnum(query.paymentMethod) : undefined,
      from: query.from,
      to: query.to,
      sort: query.sort,
      order: query.order,
      skip: paging.skip,
      take: paging.take,
    });

    res.json({
      ...paginate(rows, total, paging),
      // Sales and Invoices are two projections of the same `invoices` rows, so
      // the chip tallies are the invoice ones. Computing them server-side keeps
      // a chip's number equal to what clicking it returns.
      counts: await invoiceService.statusCounts(),
    });
  },

  async get(req, res) {
    const { id } = vParams(req);
    res.json({ data: await saleService.get(id) });
  },

  async create(req, res) {
    const result = await saleService.createSale(vBody(req), req.user, { ip: req.ip });
    res.status(201).json({ data: result });
  },
};

export default saleController;