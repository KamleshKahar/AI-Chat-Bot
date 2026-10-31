import { userService } from '../services/user.service.js';
import { paginate, parsePaging } from '../lib/pagination.js';
import { vBody, vParams, vQuery } from '../middleware/validate.js';

export const userController = {
  async list(req, res) {
    const query = vQuery(req);
    const paging = parsePaging(query);
    const { rows, total } = await userService.list({
      search: query.search,
      role: query.role,
      status: query.status,
      sort: query.sort,
      order: query.order,
      skip: paging.skip,
      take: paging.take,
    });
    res.json(paginate(rows, total, paging));
  },

  async detail(req, res) {
    const { id } = vParams(req);
    res.json({ data: await userService.detail(id) });
  },

  async create(req, res) {
    res.status(201).json({ data: await userService.create(vBody(req), req.user, { ip: req.ip }) });
  },

  async update(req, res) {
    const { id } = vParams(req);
    res.json({ data: await userService.update(id, vBody(req), req.user, { ip: req.ip }) });
  },

  async resetPassword(req, res) {
    const { id } = vParams(req);
    res.json({
      data: await userService.resetPassword(id, vBody(req), req.user, { ip: req.ip }),
    });
  },
};

export default userController;
