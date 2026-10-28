import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHistoryService, addDays, enumerateDays } from './historyService.js';

const srcDir = path.dirname(fileURLToPath(import.meta.url));

function setup() {
  const db = new Database(':memory:');
  db.exec(fs.readFileSync(path.join(srcDir, 'schema.sql'), 'utf8'));
  return { db, hs: createHistoryService(db, null) };
}

function setPrices(db, symbol, prices) {
  const ins = db.prepare(
    `INSERT OR REPLACE INTO price_history (symbol, day, price_usdt, source) VALUES (?, ?, ?, 'test')`,
  );
  for (const [day, price] of Object.entries(prices)) ins.run(symbol, day, price);
}

test('日期工具：区间枚举与加减天数', () => {
  assert.deepEqual(enumerateDays('2026-01-01', '2026-01-03'), ['2026-01-01', '2026-01-02', '2026-01-03']);
  assert.equal(addDays('2026-01-01', -6), '2025-12-26');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28'); // 跨月
});

test('无交易时每天净值等于本金，回撤为 0', () => {
  const { hs } = setup();
  const r = hs.series({
    transactions: [],
    settings: { initial_capital_usdt: 10000 },
    fromDay: '2026-01-01',
    toDay: '2026-01-03',
  });
  assert.equal(r.points.length, 3);
  assert.ok(r.points.every((p) => p.net_worth === 10000));
  assert.equal(r.max_drawdown, 0);
});

test('净值随持仓价格变化，最大回撤按峰值算', () => {
  const { db, hs } = setup();
  setPrices(db, 'BTC', { '2026-01-01': 10000, '2026-01-02': 12000, '2026-01-03': 9000 });
  const r = hs.series({
    transactions: [
      { id: 1, ts: '2026-01-01T10:00:00', type: 'BUY', symbol: 'BTC', quantity: 1, total_usdt: 10000 },
    ],
    settings: { initial_capital_usdt: 10000 },
    fromDay: '2026-01-01',
    toDay: '2026-01-03',
  });
  assert.deepEqual(r.points.map((p) => p.net_worth), [10000, 12000, 9000]);
  assert.equal(r.max_drawdown.toFixed(4), '0.2500'); // (12000-9000)/12000
  assert.equal(r.drawdown_from, '2026-01-02');
  assert.equal(r.drawdown_to, '2026-01-03');
});

test('入金不产生收益：TWR 剔除现金流', () => {
  const { hs } = setup();
  const r = hs.series({
    transactions: [
      { id: 1, ts: '2026-01-02T10:00:00', type: 'DEPOSIT', symbol: null, quantity: null, total_usdt: 10000 },
    ],
    settings: { initial_capital_usdt: 10000 },
    fromDay: '2026-01-01',
    toDay: '2026-01-03',
  });
  assert.deepEqual(r.points.map((p) => p.net_worth), [10000, 20000, 20000]);
  assert.deepEqual(r.points.map((p) => p.invested), [10000, 20000, 20000]);
  assert.equal(r.points[2].twr_index, 1); // 净值翻倍但收益为 0
  assert.equal(r.max_drawdown, 0);
});

test('卖出后已实现盈亏计入，且不再受价格波动影响', () => {
  const { db, hs } = setup();
  setPrices(db, 'BTC', { '2026-01-01': 10000, '2026-01-02': 12000, '2026-01-03': 9000 });
  const r = hs.series({
    transactions: [
      { id: 1, ts: '2026-01-01T10:00:00', type: 'BUY', symbol: 'BTC', quantity: 1, total_usdt: 10000 },
      { id: 2, ts: '2026-01-02T10:00:00', type: 'SELL', symbol: 'BTC', quantity: 1, total_usdt: 12000 },
    ],
    settings: { initial_capital_usdt: 10000 },
    fromDay: '2026-01-01',
    toDay: '2026-01-03',
  });
  assert.deepEqual(r.points.map((p) => p.net_worth), [10000, 12000, 12000]); // 卖光后不再波动
  assert.equal(r.points[2].realized, 2000);
  assert.equal(r.max_drawdown, 0);
});

test('取不到历史价格时用成本价兜底并标记 estimated', () => {
  const { hs } = setup();
  const r = hs.series({
    transactions: [
      { id: 1, ts: '2026-01-01T10:00:00', type: 'BUY', symbol: 'BTC', quantity: 2, total_usdt: 20000 },
    ],
    settings: { initial_capital_usdt: 20000 },
    fromDay: '2026-01-01',
    toDay: '2026-01-02',
  });
  assert.equal(r.points[0].estimated, true);
  assert.equal(r.points[0].market_value, 20000); // 兜底价 = 成本价，故市值等于成本
});

test('当日无价格时向前取最近一天的价格', () => {
  const { db, hs } = setup();
  setPrices(db, 'BTC', { '2026-01-01': 10000 }); // 1 月 2 日没有数据
  const r = hs.series({
    transactions: [
      { id: 1, ts: '2026-01-01T10:00:00', type: 'BUY', symbol: 'BTC', quantity: 1, total_usdt: 10000 },
    ],
    settings: { initial_capital_usdt: 10000 },
    fromDay: '2026-01-01',
    toDay: '2026-01-02',
  });
  assert.equal(r.points[1].market_value, 10000);
  assert.equal(r.points[1].estimated, false);
});
