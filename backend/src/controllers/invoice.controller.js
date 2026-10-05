import { invoiceService } from '../services/invoice.service.js';
import { paginate, parsePaging } from '../lib/pagination.js';
import { vBody, vParams, vQuery } from '../middleware/validate.js';

export const invoiceController = {
  async list(req, res) {
    const query = vQuery(req);
    const paging = parsePaging(query);

    const { rows, total } = await invoiceService.list({
      search: query.search,
      paymentStatus: query.paymentStatus,
      from: query.from,
      to: query.to,
      sort: query.sort,
      order: query.order,
      skip: paging.skip,
      take: paging.take,
    });

    res.json({
      ...paginate(rows, total, paging),
      counts: await invoiceService.statusCounts(),
    });
  },

  async get(req, res) {
    const { id } = vParams(req);
    res.json({ data: await invoiceService.get(id) });
  },

  async recordPayment(req, res) {
    const { id } = vParams(req);
    const data = await invoiceService.recordPayment(id, vBody(req), req.user, { ip: req.ip });
    res.status(201).json({ data });
  },

  async remove(req, res) {
    const { id } = vParams(req);
    res.json({ data: await invoiceService.remove(id, req.user, { ip: req.ip }) });
  },

  /** The same document projected into the Sales shape. */
  async asSale(req, res) {
    const { id } = vParams(req);
    res.json({ data: await invoiceService.asSale(id) });
  },
};

export default invoiceController;