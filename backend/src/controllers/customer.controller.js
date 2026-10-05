import { customerService } from '../services/customer.service.js';
import { paginate, parsePaging } from '../lib/pagination.js';
import { vBody, vParams, vQuery } from '../middleware/validate.js';

export const customerController = {
  async list(req, res) {
    const query = vQuery(req);
    const paging = parsePaging(query);
    const { rows, total } = await customerService.list({
      search: query.search,
      status: query.status,
      balance: query.balance,
      sort: query.sort,
      order: query.order,
      skip: paging.skip,
      take: paging.take,
    });
    res.json(paginate(rows, total, paging));
  },

  async detail(req, res) {
    const { id } = vParams(req);
    res.json({ data: await customerService.detail(id) });
  },

  async create(req, res) {
    res.status(201).json({ data: await customerService.create(vBody(req), req.user, { ip: req.ip }) });
  },

  async update(req, res) {
    const { id } = vParams(req);
    res.json({ data: await customerService.update(id, vBody(req), req.user, { ip: req.ip }) });
  },

  async remove(req, res) {
    const { id } = vParams(req);
    res.json({ data: await customerService.remove(id, req.user, { ip: req.ip }) });
  },
};

export default customerController;