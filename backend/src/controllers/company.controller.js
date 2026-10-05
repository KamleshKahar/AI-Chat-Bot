import { companyService } from '../services/company.service.js';
import { vBody } from '../middleware/validate.js';

export const companyController = {
  async get(req, res) {
    res.json({ data: await companyService.get() });
  },

  async update(req, res) {
    res.json({ data: await companyService.update(vBody(req), req.user, { ip: req.ip }) });
  },
};

export default companyController;