import { creditNoteService } from '../services/creditNote.service.js';
import { paginate, parsePaging } from '../lib/pagination.js';
import { vBody, vParams, vQuery } from '../middleware/validate.js';

export const creditNoteController = {
  async list(req, res) {
    const query = vQuery(req);
    const paging = parsePaging(query);

    const { rows, total } = await creditNoteService.list({
      search: query.search,
      from: query.from,
      to: query.to,
      sort: query.sort,
      order: query.order,
      skip: paging.skip,
      take: paging.take,
    });

    res.json(paginate(rows, total, paging));
  },

  async get(req, res) {
    const { id } = vParams(req);
    res.json({ data: await creditNoteService.get(id) });
  },

  async create(req, res) {
    const body = vBody(req);
    const data = await creditNoteService.create(body.invoiceId, body, req.user, { ip: req.ip });
    res.status(201).json({ data });
  },

  async remove(req, res) {
    const { id } = vParams(req);
    res.json({ data: await creditNoteService.remove(id, req.user, { ip: req.ip }) });
  },
};

export default creditNoteController;
