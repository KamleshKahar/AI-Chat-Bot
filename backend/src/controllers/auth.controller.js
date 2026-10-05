import { authService } from '../services/auth.service.js';
import { vBody } from '../middleware/validate.js';

export const authController = {
  async login(req, res) {
    // Every success response in this API is `{ data: ... }` — the auth module
    // was the last holdout, which forced the frontend client to special-case
    // exactly the three calls it makes first. Keep the envelope uniform.
    res.json({ data: await authService.login(vBody(req), { ip: req.ip }) });
  },

  async me(req, res) {
    res.json({ data: await authService.me(req.user.id) });
  },

  async logout(req, res) {
    res.json({ data: await authService.logout(req.user, { ip: req.ip }) });
  },

  async changePassword(req, res) {
    res.json({ data: await authService.changePassword(req.user.id, vBody(req), { ip: req.ip }) });
  },
};

export default authController;