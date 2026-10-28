import express from 'express';
import { computeState } from './engine.js';

export function createApp({ repo, priceService }) {
  const app = express();
  app.use(express.json());

  const fail = (res, err, status = 400) => res.status(status).json({ error: err.message });

  const symbolsOf = (transactions) => [...new Set(transactions.filter((t) => t.symbol).map((t) => t.symbol))];

  app.get('/api/state', async (req, res) => {
    try {
      const settings = repo.getSettings();
      const transactions = repo.listTransactions();
      const prices = await priceService.getPrices(symbolsOf(transactions), { ttlSeconds: settings.price_ttl_seconds });
      res.json({ settings, transactions, ...computeState({ transactions, settings, prices }), prices });
    } catch (err) { fail(res, err, 500); }
  });

  app.get('/api/transactions', (req, res) => {
    try { res.json(repo.listTransactions(req.query.symbol)); } catch (err) { fail(res, err, 500); }
  });

  app.post('/api/transactions', (req, res) => {
    try { res.status(201).json(repo.addTransaction(req.body)); } catch (err) { fail(res, err); }
  });

  app.delete('/api/transactions/:id', (req, res) => {
    try { repo.deleteTransaction(Number(req.params.id)); res.json({ ok: true }); } catch (err) { fail(res, err); }
  });

  app.post('/api/transactions/:id/restore', (req, res) => {
    try { repo.restoreTransaction(Number(req.params.id)); res.json({ ok: true }); } catch (err) { fail(res, err); }
  });

  app.get('/api/settings', (req, res) => res.json(repo.getSettings()));

  app.put('/api/settings', (req, res) => {
    try { res.json(repo.updateSettings(req.body)); } catch (err) { fail(res, err); }
  });

  app.put('/api/prices/:symbol', (req, res) => {
    try {
      priceService.setOverride(req.params.symbol, req.body.price);
      res.json({ ok: true });
    } catch (err) { fail(res, err); }
  });

  app.delete('/api/prices/:symbol', (req, res) => {
    try { priceService.clearOverride(req.params.symbol); res.json({ ok: true }); } catch (err) { fail(res, err); }
  });

  app.post('/api/prices/refresh', async (req, res) => {
    try {
      const settings = repo.getSettings();
      const symbols = symbolsOf(repo.listTransactions());
      const prices = await priceService.getPrices(symbols, { ttlSeconds: settings.price_ttl_seconds, force: true });
      res.json({ prices });
    } catch (err) { fail(res, err, 500); }
  });

  app.get('/api/export', (req, res) => {
    try {
      const transactions = repo.listTransactions();
      const stamp = new Date().toISOString().slice(0, 10);
      if (req.query.format === 'csv') {
        const header = 'id,ts,type,symbol,quantity,total_usdt,unit_price,note\n';
        const rows = transactions.map((t) => {
          const unit = t.quantity ? (t.total_usdt / t.quantity).toFixed(8) : '';
          const note = `"${String(t.note ?? '').replace(/"/g, '""')}"`;
          return [t.id, t.ts, t.type, t.symbol ?? '', t.quantity ?? '', t.total_usdt, unit, note].join(',');
        });
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="transactions-${stamp}.csv"`);
        return res.send(header + rows.join('\n'));
      }
      res.setHeader('Content-Disposition', `attachment; filename="ledger-${stamp}.json"`);
      res.json({ exported_at: new Date().toISOString(), settings: repo.getSettings(), transactions });
    } catch (err) { fail(res, err, 500); }
  });

  return app;
}
