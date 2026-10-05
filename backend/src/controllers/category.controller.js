import { categoryService } from '../services/category.service.js';
import { vBody, vParams } from '../middleware/validate.js';

export const categoryController = {
  async list(req, res) {
    const data = await categoryService.list();
    // Categories are deliberately unpaginated — the product filter dropdowns need
    // the complete active set, and the collection is bounded by nature. The
    // `meta` block is still emitted so that every list endpoint in this API has
    // the identical `{ data, meta }` shape and a client can consume all of them
    // through one code path instead of special-casing this one.
    res.json({
      data,
      meta: {
        total: data.length,
        page: 1,
        limit: data.length,
        totalPages: 1,
      },
    });
  },

  async create(req, res) {
    res.status(201).json({ data: await categoryService.create(vBody(req), req.user, { ip: req.ip }) });
  },

  async update(req, res) {
    const { id } = vParams(req);
    res.json({ data: await categoryService.update(id, vBody(req), req.user, { ip: req.ip }) });
  },

  async remove(req, res) {
    const { id } = vParams(req);
    res.json({ data: await categoryService.remove(id, req.user, { ip: req.ip }) });
  },
};

export default categoryController;