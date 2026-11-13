import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeState, availableQuantity } from './engine.js';

test('单次买入：持仓数量、成本、现金扣减', () => {
  const s = computeState({
    transactions: [{ id: 1, ts: '2026-01-01T00:00:00Z', type: 'BUY', symbol: 'BTC', quantity: 0.5, total_usdt: 30000 }],
    settings: { initial_capital_usdt: 100000 },
    prices: {},
  });
  assert.equal(s.cash_usdt, 70000);
  assert.equal(s.positions.length, 1);
  assert.equal(s.positions[0].quantity, 0.5);
  assert.equal(s.positions[0].cost_basis, 30000);
  assert.equal(s.positions[0].avg_cost, 60000);
});

test('多次买入：按累计买入金额算成本均价', () => {
  const s = computeState({
    transactions: [
      { id: 1, ts: '2026-01-01T00:00:00Z', type: 'BUY', symbol: 'BTC', quantity: 1, total_usdt: 60000 },
      { id: 2, ts: '2026-02-01T00:00:00Z', type: 'BUY', symbol: 'BTC', quantity: 1, total_usdt: 80000 },
    ],
    settings: { initial_capital_usdt: 200000 },
    prices: {},
  });
  assert.equal(s.positions[0].quantity, 2);
  assert.equal(s.positions[0].cost_basis, 140000);
  assert.equal(s.positions[0].avg_cost, 70000);
  assert.equal(s.cash_usdt, 60000);
});

test('部分卖出：卖回的钱冲减成本，剩余均价下降', () => {
  const s = computeState({
    transactions: [
      { id: 1, ts: '2026-01-01T00:00:00Z', type: 'BUY', symbol: 'BTC', quantity: 2, total_usdt: 120000 },
      { id: 2, ts: '2026-02-01T00:00:00Z', type: 'SELL', symbol: 'BTC', quantity: 0.5, total_usdt: 45000 },
    ],
    settings: { initial_capital_usdt: 150000 },
    prices: {},
  });
  assert.equal(s.positions[0].quantity, 1.5);
  assert.equal(s.positions[0].cost_basis, 75000); // 120000 - 45000
  assert.equal(s.positions[0].avg_cost, 50000); // 75000 / 1.5
  assert.equal(s.totals.total_sold_usdt, 45000);
  assert.equal(s.cash_usdt, 75000); // 150000 - 120000 + 45000
});

test('全部卖出：净投入为负时，收益仍计入盈亏而不丢失', () => {
  const s = computeState({
    transactions: [
      { id: 1, ts: '2026-01-01T00:00:00Z', type: 'BUY', symbol: 'ETH', quantity: 10, total_usdt: 30000 },
      { id: 2, ts: '2026-02-01T00:00:00Z', type: 'SELL', symbol: 'ETH', quantity: 10, total_usdt: 35000 },
    ],
    settings: { initial_capital_usdt: 30000 },
    prices: { ETH: { price: 3000, stale: false } },
  });
  assert.equal(s.positions[0].quantity, 0);
  assert.equal(s.positions[0].cost_basis, -5000); // 30000 - 35000
  assert.equal(s.positions[0].unrealized_pnl, 5000); // 0 市值 - (-5000)
  assert.equal(s.positions[0].unrealized_pnl_pct, null); // 成本为负，收益率不显示
  assert.equal(s.totals.total_sold_usdt, 35000);
  assert.equal(s.cash_usdt, 35000);
});

test('用户场景：100 买 2 个，涨到 110 卖 1 个', () => {
  const s = computeState({
    transactions: [
      { id: 1, ts: '2026-01-01T00:00:00Z', type: 'BUY', symbol: 'X', quantity: 2, total_usdt: 200 },
      { id: 2, ts: '2026-01-02T00:00:00Z', type: 'SELL', symbol: 'X', quantity: 1, total_usdt: 110 },
    ],
    settings: { initial_capital_usdt: 200 },
    prices: { X: { price: 110, stale: false } },
  });
  const p = s.positions[0];
  assert.equal(p.quantity, 1);
  assert.equal(p.cost_basis, 90); // 200 - 110
  assert.equal(p.avg_cost, 90);
  assert.equal(p.market_value, 110);
  assert.equal(p.unrealized_pnl, 20);
  assert.equal(p.unrealized_pnl_pct.toFixed(4), '0.2222');
  assert.equal(s.totals.total_sold_usdt, 110);
  // 账必须平：盈亏 = 净资产 - 总投入
  assert.equal(s.totals.unrealized_pnl_total, s.totals.net_worth - s.totals.invested_capital);
  assert.equal(s.totals.net_worth - s.totals.invested_capital, 20);
});

test('超额回本：净投入为负时收益率显示 — 而不是荒谬数字', () => {
  const s = computeState({
    transactions: [
      { id: 1, ts: '2026-01-01T00:00:00Z', type: 'BUY', symbol: 'X', quantity: 2, total_usdt: 200 },
      { id: 2, ts: '2026-01-02T00:00:00Z', type: 'SELL', symbol: 'X', quantity: 1, total_usdt: 300 },
    ],
    settings: { initial_capital_usdt: 200 },
    prices: { X: { price: 110, stale: false } },
  });
  assert.equal(s.positions[0].cost_basis, -100);
  assert.equal(s.positions[0].avg_cost, -100);
  assert.equal(s.positions[0].unrealized_pnl_pct, null);
  assert.equal(s.positions[0].unrealized_pnl, 210);
});

test('入金出金计入总投入本金，不影响持仓', () => {
  const s = computeState({
    transactions: [
      { id: 1, ts: '2026-01-01T00:00:00Z', type: 'DEPOSIT', symbol: null, quantity: null, total_usdt: 50000 },
      { id: 2, ts: '2026-01-02T00:00:00Z', type: 'BUY', symbol: 'BTC', quantity: 0.5, total_usdt: 40000 },
      { id: 3, ts: '2026-01-03T00:00:00Z', type: 'WITHDRAW', symbol: null, quantity: null, total_usdt: 10000 },
    ],
    settings: { initial_capital_usdt: 100000 },
    prices: {},
  });
  assert.equal(s.totals.invested_capital, 140000); // 100000 + 50000 - 10000
  assert.equal(s.cash_usdt, 100000); // 100000 + 50000 - 40000 - 10000
  assert.equal(s.positions[0].symbol, 'BTC');
});

test('乱序录入按 ts 重放，结果与顺序录入一致', () => {
  const txns = [
    { id: 9, ts: '2026-02-01T00:00:00Z', type: 'SELL', symbol: 'BTC', quantity: 0.5, total_usdt: 45000 },
    { id: 10, ts: '2026-01-01T00:00:00Z', type: 'BUY', symbol: 'BTC', quantity: 1, total_usdt: 60000 },
  ];
  const ordered = [
    { id: 1, ts: '2026-01-01T00:00:00Z', type: 'BUY', symbol: 'BTC', quantity: 1, total_usdt: 60000 },
    { id: 2, ts: '2026-02-01T00:00:00Z', type: 'SELL', symbol: 'BTC', quantity: 0.5, total_usdt: 45000 },
  ];
  const opts = { settings: { initial_capital_usdt: 100000 }, prices: {} };
  assert.deepEqual(computeState({ ...opts, transactions: txns }), computeState({ ...opts, transactions: ordered }));
});

test('市值、浮盈、收益率、占比', () => {
  const s = computeState({
    transactions: [{ id: 1, ts: '2026-01-01T00:00:00Z', type: 'BUY', symbol: 'BTC', quantity: 1, total_usdt: 60000 }],
    settings: { initial_capital_usdt: 100000 },
    prices: { BTC: { price: 75000, stale: false } },
  });
  const p = s.positions[0];
  assert.equal(p.market_value, 75000);
  assert.equal(p.unrealized_pnl, 15000);
  assert.equal(p.unrealized_pnl_pct, 0.25);
  assert.equal(p.price_stale, false);
  assert.equal(s.totals.market_value_total, 75000);
  assert.equal(s.totals.net_worth, 115000); // 40000 现金 + 75000 市值
  assert.equal(s.totals.roi_pct, 0.15);
  assert.equal(p.weight, 75000 / 115000); // 占比分母是净资产（含现金）
});

test('无价格时市值与盈亏为 null，不影响现金', () => {
  const s = computeState({
    transactions: [
      { id: 1, ts: '2026-01-01T00:00:00Z', type: 'BUY', symbol: 'BTC', quantity: 1, total_usdt: 60000 },
      { id: 2, ts: '2026-02-01T00:00:00Z', type: 'SELL', symbol: 'BTC', quantity: 1, total_usdt: 66000 },
    ],
    settings: { initial_capital_usdt: 100000 },
    prices: {},
  });
  assert.equal(s.positions[0].market_value, null);
  assert.equal(s.positions[0].unrealized_pnl, null);
  assert.equal(s.cash_usdt, 106000);
  assert.equal(s.totals.total_sold_usdt, 66000);
});

test('无价格的持仓会在 warnings 中提示', () => {
  const s = computeState({
    transactions: [{ id: 1, ts: '2026-01-01T00:00:00Z', type: 'BUY', symbol: 'BTC', quantity: 1, total_usdt: 60000 }],
    settings: { initial_capital_usdt: 100000 },
    prices: {},
  });
  assert.ok(s.warnings.some((w) => w.includes('BTC') && w.includes('未取到价格')));
});

test('availableQuantity 统计某时点之前的持仓', () => {
  const txns = [
    { id: 1, ts: '2026-01-01T00:00:00Z', type: 'BUY', symbol: 'BTC', quantity: 1, total_usdt: 60000 },
    { id: 2, ts: '2026-02-01T00:00:00Z', type: 'SELL', symbol: 'BTC', quantity: 0.4, total_usdt: 30000 },
  ];
  assert.equal(availableQuantity(txns, 'BTC', '2026-03-01T00:00:00Z', 3), 0.6);
  assert.equal(availableQuantity(txns, 'BTC', '2026-01-15T00:00:00Z', 2), 1);
  assert.equal(availableQuantity(txns, 'ETH', '2026-03-01T00:00:00Z', 3), 0);
});

test('卖出导致负持仓时标记为数据不一致', () => {
  const s = computeState({
    transactions: [
      { id: 1, ts: '2026-01-01T00:00:00Z', type: 'SELL', symbol: 'BTC', quantity: 1, total_usdt: 60000 },
    ],
    settings: { initial_capital_usdt: 0 },
    prices: {},
  });
  assert.equal(s.positions[0].inconsistent, true);
  assert.ok(s.warnings.some((w) => w.includes('BTC') && w.includes('数据不一致')));
});
