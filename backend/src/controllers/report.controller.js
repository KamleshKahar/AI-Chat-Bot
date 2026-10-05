import { dashboardService } from '../services/dashboard.service.js';
import { reportService } from '../services/report.service.js';
import { ledgerRepo } from '../repositories/ledger.repo.js';
import { paginate, parsePaging } from '../lib/pagination.js';
import { serializeTransaction } from '../serializers/index.js';
import { vQuery } from '../middleware/validate.js';

export const dashboardController = {
  async summary(req, res) {
    // `data` envelope, like every other success response in this API.
    res.json({ data: await dashboardService.summary() });
  },

  async alerts(req, res) {
    const { limit } = vQuery(req);
    res.json({ data: await dashboardService.alerts(limit ?? 5) });
  },

  async transactions(req, res) {
    const { limit } = vQuery(req);
    res.json({ data: await dashboardService.transactions(limit ?? 5) });
  },
};

export const ledgerController = {
  async list(req, res) {
    const query = vQuery(req);
    const paging = parsePaging(query);

    const { rows, total } = await ledgerRepo.list({
      search: query.search,
      type: query.type,
      direction: query.direction,
      from: query.from,
      to: query.to,
      sort: query.sort,
      order: query.order,
      skip: paging.skip,
      take: paging.take,
    });

    res.json(paginate(rows.map(serializeTransaction), total, paging));
  },
};

export const reportController = {
  async salesSummary(req, res) {
    const { from, to } = vQuery(req);
    res.json({ data: await reportService.salesSummary({ from, to }) });
  },

  async revenueTrend(req, res) {
    const { from, to, granularity } = vQuery(req);
    res.json({ data: await reportService.revenueTrend({ from, to, granularity }) });
  },

  async paymentBreakdown(req, res) {
    const { from, to } = vQuery(req);
    res.json({ data: await reportService.paymentBreakdown({ from, to }) });
  },

  async productPerformance(req, res) {
    const { from, to } = vQuery(req);
    res.json({ data: await reportService.productPerformance({ from, to }) });
  },

  async inventoryValuation(req, res) {
    res.json({ data: await reportService.inventoryValuation() });
  },

  async customerPerformance(req, res) {
    const { from, to } = vQuery(req);
    res.json({ data: await reportService.customerPerformance({ from, to }) });
  },

  async cashFlow(req, res) {
    const { from, to } = vQuery(req);
    res.json({ data: await reportService.cashFlow({ from, to }) });
  },

  async receivablesAging(req, res) {
    res.json({ data: await reportService.receivablesAging() });
  },
};