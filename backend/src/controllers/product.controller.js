import { productService } from '../services/product.service.js';
import { paginate, parsePaging } from '../lib/pagination.js';
import { vBody, vParams, vQuery } from '../middleware/validate.js';

export const productController = {
  async list(req, res) {
    const query = vQuery(req);
    const paging = parsePaging(query);
    const { rows, total } = await productService.list({
      search: query.search,
      category: query.category,
      status: query.status,
      sort: query.sort,
      order: query.order,
      skip: paging.skip,
      take: paging.take,
    });

    res.json({
      ...paginate(rows, total, paging),
      // Chip counts come from the same SQL status expression as the filter.
      counts: await productService.statusCounts(),
    });
  },

  async detail(req, res) {
    const { id } = vParams(req);
    const query = vQuery(req);
    res.json({ data: await productService.detail(id, { from: query.from, to: query.to }) });
  },

  async create(req, res) {
    res.status(201).json({ data: await productService.create(vBody(req), req.user, { ip: req.ip }) });
  },

  async update(req, res) {
    const { id } = vParams(req);
    res.json({ data: await productService.update(id, vBody(req), req.user, { ip: req.ip }) });
  },

  async remove(req, res) {
    const { id } = vParams(req);
    res.json({ data: await productService.remove(id, req.user, { ip: req.ip }) });
  },

  async adjustStock(req, res) {
    const { id } = vParams(req);
    res.status(201).json({
      data: await productService.adjustStock(id, vBody(req), req.user, { ip: req.ip }),
    });
  },
};

export default productController;