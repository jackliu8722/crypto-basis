import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRepository } from './repository.js';
import { createApp } from './server.js';

const srcDir = path.dirname(fileURLToPath(import.meta.url));
let server; let base;

/** 替身价格服务：测试不能依赖真实网络，否则会慢且 flaky */
const priceStub = {
  async getPrices(symbols) {
    return Object.fromEntries(symbols.map((s) => [s, {
      price: 70000, stale: false, fetched_at: new Date().toISOString(), source: 'stub',
    }]));
  },
  setOverride() {},
  clearOverride() {},
};

/** 历史服务替身：不抓网络，只验证路由参数与结构 */
const historyStub = {
  async ensure() {
    return {};
  },
  series({ fromDay, toDay }) {
    return { points: [{ day: fromDay, net_worth: 0 }, { day: toDay, net_worth: 0 }], max_drawdown: 0 };
  },
};

before(async () => {
  const db = new Database(':memory:');
  db.exec(fs.readFileSync(path.join(srcDir, 'schema.sql'), 'utf8'));
  const app = createApp({ repo: createRepository(db), priceService: priceStub, historyService: historyStub });
  server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());

const post = (body) => fetch(`${base}/api/transactions`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});
const getState = async () => (await fetch(`${base}/api/state`)).json();

test('买入后持仓与现金正确，卖出超额被拒绝', async () => {
  assert.equal((await post({ type: 'DEPOSIT', total_usdt: 100000 })).status, 201);
  assert.equal((await post({ type: 'BUY', symbol: 'BTC', quantity: 1, total_usdt: 60000 })).status, 201);

  const bad = await post({ type: 'SELL', symbol: 'BTC', quantity: 2, total_usdt: 90000 });
  assert.equal(bad.status, 400);
  assert.match((await bad.json()).error, /卖出数量超过持仓/);

  const state = await getState();
  const btc = state.positions.find((p) => p.symbol === 'BTC');
  assert.equal(btc.quantity, 1);
  assert.equal(btc.avg_cost, 60000);
  assert.equal(state.cash_usdt, 40000);
  assert.equal(state.totals.invested_capital, 100000);
});

test('删除后重放，数字回到未录入时的状态', async () => {
  const before = await getState();
  const created = await (await post({ type: 'BUY', symbol: 'ETH', quantity: 5, total_usdt: 15000 })).json();

  await fetch(`${base}/api/transactions/${created.id}`, { method: 'DELETE' });
  const after = await getState();

  assert.equal(after.cash_usdt, before.cash_usdt);
  const eth = after.positions.find((p) => p.symbol === 'ETH');
  assert.ok(!eth || eth.quantity === 0);
});

test('恢复被删除的记录后状态复原', async () => {
  const before = await getState();
  const created = await (await post({ type: 'BUY', symbol: 'SOL', quantity: 100, total_usdt: 10000 })).json();

  await fetch(`${base}/api/transactions/${created.id}`, { method: 'DELETE' });
  await fetch(`${base}/api/transactions/${created.id}/restore`, { method: 'POST' });
  const after = await getState();

  const sol = after.positions.find((p) => p.symbol === 'SOL');
  assert.equal(sol.quantity, 100);
  assert.equal(after.cash_usdt, before.cash_usdt - 10000);
});

test('非法输入被拒绝', async () => {
  const cases = [
    { type: 'BUY', symbol: 'BTC', quantity: 0, total_usdt: 100 },
    { type: 'BUY', symbol: '', quantity: 1, total_usdt: 100 },
    { type: 'BUY', symbol: 'BTC', quantity: 1, total_usdt: -5 },
    { type: 'FOO', total_usdt: 100 },
  ];
  for (const body of cases) {
    const res = await post(body);
    assert.equal(res.status, 400, `应当拒绝 ${JSON.stringify(body)}`);
  }
});
