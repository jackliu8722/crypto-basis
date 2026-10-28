# 加密货币持仓成本记录器 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建一个本地 Web 应用，手工录入 USDT 计价的现货买卖，自动算出每个币的持仓成本、市值与收益率。

**Architecture:** 只存交易流水，每次展示时由纯函数 `computeState()` 从零重放得出全部持仓与汇总——删除或补录一笔后所有数字自动自洽，不维护易腐化的中间状态。后端 Express + SQLite（单文件），前端 Vite + React，价格从 CoinGecko 取并缓存 5 分钟。

**Tech Stack:** Node 22 · Express 4 · better-sqlite3 · node:test · Vite · React 18 · TypeScript（前端）

**分支约定（重要）**：所有开发在任务分支 `feat/crypto-cost-tracker` 上进行，**不要合并进 `main`**，也不要为了合并而切回 `main`。流程停在"分支上已提交"，等用户明确说合并再执行。

设计文档：`docs/superpowers/specs/2026-10-28-crypto-cost-tracker-design.md`

---

## 文件结构

```
package.json                根：concurrently 并行启动前后端
server/
  package.json              type: module；express + better-sqlite3
  src/
    schema.sql              建表 DDL
    db.js                   打开数据库、执行 DDL、开 WAL、启动备份
    engine.js               ★ 核心：computeState / availableQuantity（纯函数，零依赖）
    engine.test.js          计算引擎单测
    repository.js           交易与设置的 SQL 读写
    priceService.js         价格获取：覆盖 > 缓存 > CoinGecko > stale
    server.js               Express 路由装配
    index.js                启动入口（监听 127.0.0.1:3001）
  api.test.js               API 冒烟测试
web/
  package.json  vite.config.js  index.html
  src/
    main.tsx  App.tsx  api.ts  format.ts  styles.css
    components/
      SummaryCards.tsx     顶部汇总卡片
      PositionsTable.tsx   持仓表格
      TransactionForm.tsx  录入表单
      TransactionList.tsx  流水表格 + 删除/恢复
      SettingsPanel.tsx    初始本金、刷新价格、导出
```

**关键接口（后续所有任务必须与此一致）**

```js
// engine.js
computeState({ transactions, settings, prices }) -> {
  cash_usdt: number,
  positions: Array<{
    symbol, quantity, avg_cost, cost_basis,
    current_price: number|null, market_value: number|null,
    unrealized_pnl: number|null, unrealized_pnl_pct: number|null,
    price_stale: boolean, inconsistent: boolean, weight: number|null
  }>,
  totals: {
    invested_capital, market_value_total, cost_basis_total,
    unrealized_pnl_total: number|null, realized_pnl_total,
    net_worth, roi_pct: number|null
  },
  warnings: string[]
}
availableQuantity(transactions, symbol, beforeTs, beforeId) -> number

// prices 参数形状：{ BTC: { price: number, stale: boolean } }，缺失的 symbol 视为无价格
```

---

### Task 1: 项目骨架与依赖

**Files:**
- Create: `package.json`, `server/package.json`, `web/package.json`, `web/vite.config.js`, `web/index.html`

- [ ] **Step 1: 建任务分支**

```bash
git checkout -b feat/crypto-cost-tracker
```

- [ ] **Step 2: 写根 package.json**

```json
{
  "name": "crypto-cost-tracker",
  "private": true,
  "scripts": {
    "dev": "concurrently -n server,web -c cyan,magenta \"npm:dev:server\" \"npm:dev:web\"",
    "dev:server": "npm --prefix server run dev",
    "dev:web": "npm --prefix web run dev",
    "test": "npm --prefix server run test",
    "build": "npm --prefix web run build"
  },
  "devDependencies": { "concurrently": "^9.1.0" }
}
```

- [ ] **Step 3: 写 server/package.json**

```json
{
  "name": "server",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "node --watch src/index.js",
    "start": "node src/index.js",
    "test": "node --test src/"
  },
  "dependencies": {
    "better-sqlite3": "^11.7.0",
    "express": "^4.21.2"
  }
}
```

- [ ] **Step 4: 写 web/package.json 与 vite 配置**

```json
{
  "name": "web",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview"
  },
  "dependencies": { "react": "^18.3.1", "react-dom": "^18.3.1" },
  "devDependencies": {
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    "@vitejs/plugin-react": "^4.3.4",
    "typescript": "^5.7.2",
    "vite": "^6.0.5"
  }
}
```

`web/vite.config.js`：

```js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': { target: 'http://127.0.0.1:3001', changeOrigin: true } },
  },
});
```

`web/index.html`：

```html
<!doctype html>
<html lang="zh-CN">
  <head><meta charset="UTF-8" /><title>持仓成本记录器</title></head>
  <body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body>
</html>
```

- [ ] **Step 5: 安装依赖**

```bash
npm install && npm --prefix server install && npm --prefix web install
```

Expected: 全部成功，`server/node_modules/better-sqlite3/build/Release/better_sqlite3.node` 存在（说明用的是预编译包，无需 node-gyp）。

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json server/package.json web/package.json web/vite.config.js web/index.html
git commit -m "chore: 搭建前后端项目骨架"
```

---

### Task 2: 数据库层（建表、WAL、启动备份）

**Files:**
- Create: `server/src/schema.sql`, `server/src/db.js`

- [ ] **Step 1: 写 schema.sql**

```sql
CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  initial_capital_usdt REAL NOT NULL DEFAULT 0,
  price_ttl_seconds INTEGER NOT NULL DEFAULT 300
);
INSERT OR IGNORE INTO settings (id) VALUES (1);

CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('BUY','SELL','DEPOSIT','WITHDRAW')),
  symbol TEXT,
  quantity REAL,
  total_usdt REAL NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_txn_ts ON transactions (ts, id);
CREATE INDEX IF NOT EXISTS idx_txn_symbol ON transactions (symbol);

CREATE TABLE IF NOT EXISTS prices (
  symbol TEXT PRIMARY KEY,
  price_usdt REAL NOT NULL,
  source TEXT NOT NULL,
  fetched_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS price_overrides (
  symbol TEXT PRIMARY KEY,
  price_usdt REAL NOT NULL,
  updated_at TEXT NOT NULL
);
```

- [ ] **Step 2: 写 db.js**

```js
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const srcDir = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = path.resolve(srcDir, '../../data');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const DB_PATH = path.join(DATA_DIR, 'ledger.db');

export function openDb() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.exec(fs.readFileSync(path.join(srcDir, 'schema.sql'), 'utf8'));
  backup();
  return db;
}

/** 启动时快照，保留最近 7 份；失败不影响启动 */
export function backup() {
  if (!fs.existsSync(DB_PATH)) return;
  try {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const day = new Date().toISOString().slice(0, 10);
    const target = path.join(BACKUP_DIR, `ledger-${day}.db`);
    if (!fs.existsSync(target)) fs.copyFileSync(DB_PATH, target);
    const files = fs.readdirSync(BACKUP_DIR).filter((f) => f.endsWith('.db')).sort();
    for (const old of files.slice(0, -7)) fs.rmSync(path.join(BACKUP_DIR, old));
  } catch (err) {
    console.warn('[backup] 跳过：', err.message);
  }
}
```

- [ ] **Step 3: 冒烟验证建表**

```bash
cd server && node -e "import('./src/db.js').then(m=>{const db=m.openDb();console.log(db.prepare(\"SELECT name FROM sqlite_master WHERE type='table'\").all());})"
```

Expected: 输出 `settings / transactions / prices / price_overrides` 四张表，`data/ledger.db` 已生成。

- [ ] **Step 4: Commit**

```bash
git add server/src/schema.sql server/src/db.js
git commit -m "feat: 数据库层，建表 + WAL + 启动快照备份"
```

---

### Task 3: 计算引擎 — 买入与加权平均成本

**Files:**
- Create: `server/src/engine.js`, `server/src/engine.test.js`

- [ ] **Step 1: 写失败测试**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeState } from './engine.js';

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

test('多次买入：移动加权平均成本', () => {
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
```

- [ ] **Step 2: 运行确认失败**

```bash
cd server && node --test src/
```

Expected: FAIL，`Cannot find module './engine.js'`

- [ ] **Step 3: 实现买入分支与重放骨架**

```js
const EPS = 1e-8;

export function sortTransactions(txns) {
  return [...txns].sort((a, b) => (a.ts === b.ts ? a.id - b.id : a.ts < b.ts ? -1 : 1));
}

export function computeState({ transactions = [], settings = {}, prices = {} } = {}) {
  const initialCapital = Number(settings.initial_capital_usdt ?? 0);
  let cash = initialCapital;
  let realized = 0;
  const pos = new Map();

  const ensure = (symbol) => {
    if (!pos.has(symbol)) pos.set(symbol, { symbol, quantity: 0, cost_basis: 0, inconsistent: false });
    return pos.get(symbol);
  };

  for (const t of sortTransactions(transactions)) {
    // DEPOSIT / WITHDRAW 分支在 Task 5 加入
    const p = ensure(t.symbol);
    if (t.type === 'BUY') {
      cash -= t.total_usdt;
      p.quantity += t.quantity;
      p.cost_basis += t.total_usdt;
    }
    // SELL 分支在 Task 4 加入
    pos.set(t.symbol, p);
  }

  const positions = [...pos.values()].map((p) => ({
    symbol: p.symbol,
    quantity: p.quantity,
    cost_basis: p.cost_basis,
    avg_cost: p.quantity > EPS ? p.cost_basis / p.quantity : 0,
    inconsistent: p.inconsistent,
  }));

  return {
    cash_usdt: cash,
    positions,
    totals: { invested_capital: initialCapital, realized_pnl_total: realized },
    warnings: [],
  };
}
```

- [ ] **Step 4: 运行确认通过**

```bash
cd server && node --test src/
```

Expected: 2 passing

- [ ] **Step 5: Commit**

```bash
git add server/src/engine.js server/src/engine.test.js
git commit -m "feat: 计算引擎 — 买入与移动加权平均成本"
```

---

### Task 4: 计算引擎 — 卖出、已实现盈亏、清仓

**Files:**
- Modify: `server/src/engine.js`, `server/src/engine.test.js`

- [ ] **Step 1: 追加失败测试**

```js
test('部分卖出：已实现盈亏正确，剩余均价不变', () => {
  const s = computeState({
    transactions: [
      { id: 1, ts: '2026-01-01T00:00:00Z', type: 'BUY', symbol: 'BTC', quantity: 2, total_usdt: 120000 },
      { id: 2, ts: '2026-02-01T00:00:00Z', type: 'SELL', symbol: 'BTC', quantity: 0.5, total_usdt: 45000 },
    ],
    settings: { initial_capital_usdt: 150000 },
    prices: {},
  });
  assert.equal(s.positions[0].quantity, 1.5);
  assert.equal(s.positions[0].avg_cost, 60000);      // 卖出不降低剩余成本价
  assert.equal(s.positions[0].cost_basis, 90000);
  assert.equal(s.totals.realized_pnl_total, 15000);  // 45000 - 60000*0.5
  assert.equal(s.cash_usdt, 75000);                  // 150000 - 120000 + 45000
});

test('全部卖出：持仓归零，已实现盈亏保留', () => {
  const s = computeState({
    transactions: [
      { id: 1, ts: '2026-01-01T00:00:00Z', type: 'BUY', symbol: 'ETH', quantity: 10, total_usdt: 30000 },
      { id: 2, ts: '2026-02-01T00:00:00Z', type: 'SELL', symbol: 'ETH', quantity: 10, total_usdt: 35000 },
    ],
    settings: { initial_capital_usdt: 30000 },
    prices: {},
  });
  assert.equal(s.positions[0].quantity, 0);
  assert.equal(s.positions[0].cost_basis, 0);
  assert.equal(s.totals.realized_pnl_total, 5000);
  assert.equal(s.cash_usdt, 35000);
});
```

- [ ] **Step 2: 运行确认失败**

```bash
cd server && node --test src/
```

Expected: FAIL，`realized_pnl_total` 为 undefined

- [ ] **Step 3: 实现卖出分支**

把 engine.js 里 `// SELL 分支在 Task 4 加入` 这一行替换为：

```js
    } else if (t.type === 'SELL') {
      const avg = p.quantity > EPS ? p.cost_basis / p.quantity : 0;
      const costOut = avg * t.quantity;
      realized += t.total_usdt - costOut;
      cash += t.total_usdt;
      p.cost_basis -= costOut;
      p.quantity -= t.quantity;
      if (p.quantity < -EPS) p.inconsistent = true;
    }
```

并在 `pos.set(t.symbol, p);` 之前插入清仓归零（避免浮点残值）：

```js
    if (Math.abs(p.quantity) <= EPS) { p.quantity = 0; p.cost_basis = 0; }
```

- [ ] **Step 4: 运行确认通过**

```bash
cd server && node --test src/
```

Expected: 4 passing

- [ ] **Step 5: Commit**

```bash
git add server/src/engine.js server/src/engine.test.js
git commit -m "feat: 计算引擎 — 卖出、已实现盈亏、清仓归零"
```

---

### Task 5: 计算引擎 — 出入金、总投入本金、净资产

**Files:**
- Modify: `server/src/engine.js`, `server/src/engine.test.js`

- [ ] **Step 1: 追加失败测试**

```js
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
  assert.equal(s.cash_usdt, 100000);               // 100000 + 50000 - 40000 - 10000
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
```

- [ ] **Step 2: 运行确认失败**

```bash
cd server && node --test src/
```

Expected: FAIL（`net_worth` 字段尚不存在，deepEqual 也会因 `id` 之外结构不完整而失败）

- [ ] **Step 3: 实现出入金分支**

把 engine.js 里 `// DEPOSIT / WITHDRAW 分支在 Task 5 加入` 这一行替换为：

```js
    if (t.type === 'DEPOSIT') { cash += t.total_usdt; deposits += t.total_usdt; continue; }
    if (t.type === 'WITHDRAW') { cash -= t.total_usdt; withdraws += t.total_usdt; continue; }
```

并在 `let realized = 0;` 下一行声明累加器：

```js
  let deposits = 0;
  let withdraws = 0;
```

最后把 return 里的 `invested_capital: initialCapital` 改为：

```js
    totals: { invested_capital: initialCapital + deposits - withdraws, realized_pnl_total: realized },
```

- [ ] **Step 4: 运行确认通过**

```bash
cd server && node --test src/
```

Expected: 6 passing

- [ ] **Step 5: Commit**

```bash
git add server/src/engine.js server/src/engine.test.js
git commit -m "feat: 计算引擎 — 出入金、总投入本金、净资产"
```

---

### Task 6: 计算引擎 — 价格、市值、浮盈、汇总与占比

**Files:**
- Modify: `server/src/engine.js`, `server/src/engine.test.js`

- [ ] **Step 1: 追加失败测试**

```js
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
  assert.equal(s.totals.net_worth, 115000);   // 40000 现金 + 75000 市值
  assert.equal(s.totals.roi_pct, 0.15);
  assert.equal(p.weight, 75000 / 115000);      // 占比分母是净资产
});

test('无价格时市值与浮盈为 null，不影响现金与已实现', () => {
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
  assert.equal(s.totals.realized_pnl_total, 6000);
});
```

- [ ] **Step 2: 运行确认失败**

```bash
cd server && node --test src/
```

Expected: FAIL，`market_value` 为 undefined

- [ ] **Step 3: 实现价格派生与汇总**

把 engine.js 中从 `const positions = [...pos.values()].map(` 开始直到函数结束的整段（含 return）替换为下面的完整块，它在原有字段基础上补上价格派生、totals 汇总与 warnings：

```js
  const positions = [...pos.values()].map((p) => {
    const q = prices[p.symbol];
    const hasPrice = q && Number.isFinite(q.price);
    const price = hasPrice ? q.price : null;
    const market_value = hasPrice ? p.quantity * price : null;
    const avg_cost = p.quantity > EPS ? p.cost_basis / p.quantity : 0;
    return {
      symbol: p.symbol,
      quantity: p.quantity,
      avg_cost,
      cost_basis: p.cost_basis,
      current_price: price,
      market_value,
      unrealized_pnl: market_value === null ? null : market_value - p.cost_basis,
      unrealized_pnl_pct: hasPrice && avg_cost > EPS ? (price - avg_cost) / avg_cost : null,
      price_stale: !hasPrice || q.stale === true,
      inconsistent: p.inconsistent,
      weight: null, // 下一步填
    };
  });

  const marketValueTotal = positions.reduce((acc, p) => acc + (p.market_value ?? 0), 0);
  const costBasisTotal = positions.reduce((acc, p) => acc + p.cost_basis, 0);
  const unrealizedTotal = positions.every((p) => p.market_value === null)
    ? null
    : positions.reduce((acc, p) => acc + (p.unrealized_pnl ?? 0), 0);
  const investedCapital = initialCapital + deposits - withdraws;
  const netWorth = cash + marketValueTotal;

  for (const p of positions) p.weight = netWorth > EPS ? (p.market_value ?? 0) / netWorth : null;

  const warnings = [];
  if (cash < -EPS) warnings.push('USDT 余额为负，可能漏记入金');
  for (const p of positions) {
    if (p.inconsistent) warnings.push(`${p.symbol} 持仓数据不一致，疑似缺少买入记录`);
  }
  const noPrice = positions.filter((p) => p.quantity > EPS && p.market_value === null).map((p) => p.symbol);
  if (noPrice.length > 0) warnings.push(`${noPrice.join('、')} 未取到价格，其浮动盈亏未计入汇总`);

  return {
    cash_usdt: cash,
    positions,
    totals: {
      invested_capital: investedCapital,
      market_value_total: marketValueTotal,
      cost_basis_total: costBasisTotal,
      unrealized_pnl_total: unrealizedTotal,
      realized_pnl_total: realized,
      net_worth: netWorth,
      roi_pct: investedCapital > EPS ? (netWorth - investedCapital) / investedCapital : null,
    },
    warnings,
  };
```

- [ ] **Step 4: 运行确认全部通过**

```bash
cd server && node --test src/
```

Expected: 8 passing

- [ ] **Step 5: Commit**

```bash
git add server/src/engine.js server/src/engine.test.js
git commit -m "feat: 计算引擎 — 市值、浮盈、收益率、净资产与占比"
```

---

### Task 7: 卖出超额校验

**Files:**
- Modify: `server/src/engine.js`, `server/src/engine.test.js`

- [ ] **Step 1: 追加失败测试**

```js
import { availableQuantity } from './engine.js';

test('availableQuantity 统计某时点之前的持仓', () => {
  const txns = [
    { id: 1, ts: '2026-01-01T00:00:00Z', type: 'BUY', symbol: 'BTC', quantity: 1, total_usdt: 60000 },
    { id: 2, ts: '2026-02-01T00:00:00Z', type: 'SELL', symbol: 'BTC', quantity: 0.4, total_usdt: 30000 },
  ];
  assert.equal(availableQuantity(txns, 'BTC', '2026-03-01T00:00:00Z', 3), 0.6);
  assert.equal(availableQuantity(txns, 'BTC', '2026-01-15T00:00:00Z', 2), 1);
  assert.equal(availableQuantity(txns, 'ETH', '2026-03-01T00:00:00Z', 3), 0);
});
```

- [ ] **Step 2: 运行确认失败**

```bash
cd server && node --test src/
```

Expected: FAIL，`availableQuantity is not a function`

- [ ] **Step 3: 实现**

```js
export function isBefore(t, ts, id) {
  return t.ts < ts || (t.ts === ts && t.id < id);
}

export function availableQuantity(transactions, symbol, beforeTs, beforeId) {
  let qty = 0;
  for (const t of sortTransactions(transactions)) {
    if (t.symbol !== symbol) continue;
    if (!isBefore(t, beforeTs, beforeId)) continue;
    if (t.type === 'BUY') qty += t.quantity;
    else if (t.type === 'SELL') qty -= t.quantity;
  }
  return qty;
}
```

- [ ] **Step 4: 运行确认通过**

```bash
cd server && node --test src/
```

Expected: 9 passing

- [ ] **Step 5: Commit**

```bash
git add server/src/engine.js server/src/engine.test.js
git commit -m "feat: 卖出超额校验 — availableQuantity"
```

---

### Task 8: 仓储层 — 交易与设置的读写

**Files:**
- Create: `server/src/repository.js`

- [ ] **Step 1: 写 repository.js**

```js
import { availableQuantity } from './engine.js';

export function createRepository(db) {
  const insertTxn = db.prepare(`
    INSERT INTO transactions (ts, type, symbol, quantity, total_usdt, note, created_at)
    VALUES (@ts, @type, @symbol, @quantity, @total_usdt, @note, @created_at)
  `);
  const selectActive = db.prepare(`SELECT * FROM transactions WHERE deleted_at IS NULL ORDER BY ts ASC, id ASC`);
  const selectBySymbol = db.prepare(`SELECT * FROM transactions WHERE deleted_at IS NULL AND symbol = ? ORDER BY ts ASC, id ASC`);
  const softDelete = db.prepare(`UPDATE transactions SET deleted_at = ? WHERE id = ?`);
  const restore = db.prepare(`UPDATE transactions SET deleted_at = NULL WHERE id = ?`);

  return {
    listTransactions(symbol) {
      return symbol ? selectBySymbol.all(symbol.toUpperCase()) : selectActive.all();
    },

    /** @throws {Error} 校验失败时 message 直接面向用户 */
    addTransaction(input) {
      const type = String(input.type ?? '').toUpperCase();
      if (!['BUY', 'SELL', 'DEPOSIT', 'WITHDRAW'].includes(type)) throw new Error('未知的交易类型');

      const total = Number(input.total_usdt);
      if (!Number.isFinite(total) || total <= 0) throw new Error('USDT 金额必须是大于 0 的数字');

      const ts = input.ts ? new Date(input.ts).toISOString() : new Date().toISOString();
      if (Number.isNaN(Date.parse(ts))) throw new Error('时间格式不正确');

      let symbol = null;
      let quantity = null;

      if (type === 'BUY' || type === 'SELL') {
        symbol = String(input.symbol ?? '').trim().toUpperCase();
        if (!symbol) throw new Error('请填写币种');
        quantity = Number(input.quantity);
        if (!Number.isFinite(quantity) || quantity <= 0) throw new Error('数量必须是大于 0 的数字');

        if (type === 'SELL') {
          const probeId = Number.MAX_SAFE_INTEGER;
          const available = availableQuantity(selectActive.all(), symbol, ts, probeId);
          if (quantity > available + 1e-8) {
            throw new Error(`卖出数量超过持仓：${symbol} 当前仅持有 ${available}`);
          }
        }
      }

      const row = {
        ts, type, symbol, quantity, total_usdt: total,
        note: input.note ? String(input.note) : null,
        created_at: new Date().toISOString(),
      };
      const info = insertTxn.run(row);
      return { id: Number(info.lastInsertRowid), ...row };
    },

    deleteTransaction(id) {
      const info = softDelete.run(new Date().toISOString(), id);
      if (info.changes === 0) throw new Error('记录不存在');
    },

    restoreTransaction(id) {
      const info = restore.run(id);
      if (info.changes === 0) throw new Error('记录不存在');
    },

    getSettings() {
      return db.prepare(`SELECT * FROM settings WHERE id = 1`).get();
    },

    updateSettings(patch) {
      const cur = this.getSettings();
      db.prepare(`UPDATE settings SET initial_capital_usdt = ?, price_ttl_seconds = ? WHERE id = 1`)
        .run(
          patch.initial_capital_usdt ?? cur.initial_capital_usdt,
          patch.price_ttl_seconds ?? cur.price_ttl_seconds,
        );
      return this.getSettings();
    },
  };
}
```

- [ ] **Step 2: 冒烟验证**

```bash
cd server && node -e "
import('./src/db.js').then(async (d) => {
  const { createRepository } = await import('./src/repository.js');
  const repo = createRepository(d.openDb());
  repo.addTransaction({ type: 'BUY', symbol: 'btc', quantity: 1, total_usdt: 60000 });
  try { repo.addTransaction({ type: 'SELL', symbol: 'BTC', quantity: 5, total_usdt: 100 }); }
  catch (e) { console.log('拒绝:', e.message); }
  console.log(repo.listTransactions());
});"
```

Expected: 第一行输出 `拒绝: 卖出数量超过持仓：BTC 当前仅持有 1`，随后列出一条 BUY 记录（symbol 已大写为 BTC）。

- [ ] **Step 3: Commit**

```bash
git add server/src/repository.js
git commit -m "feat: 仓储层 — 交易与设置的读写及校验"
```

---

### Task 9: 价格服务

**Files:**
- Create: `server/src/priceService.js`

- [ ] **Step 1: 写 priceService.js**

```js
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from './db.js';

const API = 'https://api.coingecko.com/api/v3';
const COINS_CACHE = path.join(DATA_DIR, 'coingecko-coins.json');

const BUILTIN_IDS = {
  BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana', BNB: 'bnb', XRP: 'ripple',
  DOGE: 'dogecoin', ADA: 'cardano', AVAX: 'avalanche-2', LINK: 'chainlink',
  DOT: 'polkadot', MATIC: 'matic-network', LTC: 'litecoin', TRX: 'tron',
  ATOM: 'cosmos', NEAR: 'near', APT: 'aptos', ARB: 'arbitrum', OP: 'optimism',
  SUI: 'sui', TON: 'the-open-network', FIL: 'filecoin', UNI: 'uniswap',
  AAVE: 'aave', INJ: 'injective-protocol', SEI: 'sei-network', TIA: 'celestia',
  PEPE: 'pepe', WIF: 'dogwifcoin', BCH: 'bitcoin-cash', ETC: 'ethereum-classic',
};

export function createPriceService(db) {
  const getCached = db.prepare(`SELECT * FROM prices WHERE symbol = ?`);
  const upsertCached = db.prepare(`
    INSERT INTO prices (symbol, price_usdt, source, fetched_at) VALUES (@symbol, @price_usdt, @source, @fetched_at)
    ON CONFLICT(symbol) DO UPDATE SET price_usdt = @price_usdt, source = @source, fetched_at = @fetched_at
  `);
  const getOverride = db.prepare(`SELECT * FROM price_overrides WHERE symbol = ?`);
  const upsertOverride = db.prepare(`
    INSERT INTO price_overrides (symbol, price_usdt, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(symbol) DO UPDATE SET price_usdt = excluded.price_usdt, updated_at = excluded.updated_at
  `);
  const deleteOverride = db.prepare(`DELETE FROM price_overrides WHERE symbol = ?`);

  async function resolveId(symbol) {
    if (BUILTIN_IDS[symbol]) return BUILTIN_IDS[symbol];
    let list = [];
    try {
      if (fs.existsSync(COINS_CACHE) && Date.now() - fs.statSync(COINS_CACHE).mtimeMs < 864e5) {
        list = JSON.parse(fs.readFileSync(COINS_CACHE, 'utf8'));
      } else {
        const res = await fetch(`${API}/coins/list`);
        if (!res.ok) throw new Error(`coins/list ${res.status}`);
        list = await res.json();
        fs.mkdirSync(DATA_DIR, { recursive: true });
        fs.writeFileSync(COINS_CACHE, JSON.stringify(list));
      }
    } catch { return null; }
    const hit = list.find((c) => String(c.symbol).toUpperCase() === symbol);
    return hit ? hit.id : null;
  }

  return {
    /** @returns {{[symbol]: {price: number|null, stale: boolean, fetched_at: string|null, source: string}}} */
    async getPrices(symbols, { ttlSeconds = 300, force = false } = {}) {
      const now = Date.now();
      const out = {};
      const need = [];

      for (const raw of symbols) {
        const symbol = String(raw).toUpperCase();
        if (symbol === 'USDT') { out[symbol] = { price: 1, stale: false, fetched_at: null, source: 'fixed' }; continue; }

        const ov = getOverride.get(symbol);
        if (ov) { out[symbol] = { price: ov.price_usdt, stale: false, fetched_at: ov.updated_at, source: 'manual' }; continue; }

        const cached = getCached.get(symbol);
        const ageSeconds = cached ? (now - Date.parse(cached.fetched_at)) / 1000 : Infinity;
        if (cached && !force && ageSeconds < ttlSeconds) {
          out[symbol] = { price: cached.price_usdt, stale: false, fetched_at: cached.fetched_at, source: cached.source };
          continue;
        }
        out[symbol] = cached
          ? { price: cached.price_usdt, stale: true, fetched_at: cached.fetched_at, source: cached.source }
          : { price: null, stale: true, fetched_at: null, source: 'none' };
        need.push(symbol);
      }

      if (need.length > 0) {
        const idToSymbol = new Map();
        for (const s of need) {
          const id = await resolveId(s);
          if (id) idToSymbol.set(id, s);
        }
        if (idToSymbol.size > 0) {
          try {
            const url = `${API}/simple/price?ids=${[...idToSymbol.keys()].join(',')}&vs_currencies=usd`;
            const res = await fetch(url);
            if (!res.ok) throw new Error(`simple/price ${res.status}`);
            const data = await res.json();
            const fetched_at = new Date().toISOString();
            for (const [id, symbol] of idToSymbol) {
              const price = data[id]?.usd;
              if (Number.isFinite(price)) {
                upsertCached.run({ symbol, price_usdt: price, source: 'coingecko', fetched_at });
                out[symbol] = { price, stale: false, fetched_at, source: 'coingecko' };
              }
            }
          } catch (err) {
            console.warn('[price] 取价失败，沿用缓存：', err.message);
          }
        }
      }
      return out;
    },

    setOverride(symbol, price) {
      const s = String(symbol).toUpperCase();
      if (!Number.isFinite(Number(price)) || Number(price) <= 0) throw new Error('价格必须是大于 0 的数字');
      upsertOverride.run(s, Number(price), new Date().toISOString());
    },

    clearOverride(symbol) {
      deleteOverride.run(String(symbol).toUpperCase());
    },
  };
}
```

- [ ] **Step 2: 冒烟验证（真实网络）**

```bash
cd server && node -e "
import('./src/db.js').then(async (d) => {
  const { createPriceService } = await import('./src/priceService.js');
  const ps = createPriceService(d.openDb());
  console.log(await ps.getPrices(['BTC','ETH','SOL']));
});"
```

Expected: 三个币都返回 `price` 为正数、`source: 'coingecko'`、`stale: false`。若网络不通则 `price: null, stale: true`——不算失败，降级路径本就如此。

- [ ] **Step 3: Commit**

```bash
git add server/src/priceService.js
git commit -m "feat: 价格服务 — 覆盖 > 缓存 > CoinGecko，失败降级为 stale"
```

---

### Task 10: Express API

**Files:**
- Create: `server/src/server.js`, `server/src/index.js`

- [ ] **Step 1: 写 server.js**

```js
import express from 'express';
import { computeState } from './engine.js';

export function createApp({ repo, priceService }) {
  const app = express();
  app.use(express.json());

  const fail = (res, err, status = 400) => res.status(status).json({ error: err.message });

  app.get('/api/state', async (req, res) => {
    try {
      const settings = repo.getSettings();
      const transactions = repo.listTransactions();
      const symbols = [...new Set(transactions.filter((t) => t.symbol).map((t) => t.symbol))];
      const prices = await priceService.getPrices(symbols, { ttlSeconds: settings.price_ttl_seconds });
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
      const transactions = repo.listTransactions();
      const symbols = [...new Set(transactions.filter((t) => t.symbol).map((t) => t.symbol))];
      const prices = await priceService.getPrices(symbols, { ttlSeconds: settings.price_ttl_seconds, force: true });
      res.json({ prices });
    } catch (err) { fail(res, err, 500); }
  });

  return app;
}
```

- [ ] **Step 2: 写 index.js**

```js
import { openDb } from './db.js';
import { createRepository } from './repository.js';
import { createPriceService } from './priceService.js';
import { createApp } from './server.js';

const db = openDb();
const app = createApp({ repo: createRepository(db), priceService: createPriceService(db) });
app.listen(3001, '127.0.0.1', () => console.log('http://127.0.0.1:3001'));
```

- [ ] **Step 3: 冒烟验证**

```bash
cd server && (node src/index.js &) && sleep 1 && \
curl -s -X POST localhost:3001/api/transactions -H 'Content-Type: application/json' -d '{"type":"BUY","symbol":"BTC","quantity":1,"total_usdt":60000}' && \
curl -s -X POST localhost:3001/api/transactions -H 'Content-Type: application/json' -d '{"type":"SELL","symbol":"BTC","quantity":2,"total_usdt":90000}' && \
curl -s localhost:3001/api/state | head -c 600; pkill -f "node src/index.js"
```

Expected: 第一笔返回 201；第二笔返回 `{"error":"卖出数量超过持仓：BTC 当前仅持有 1"}`；`/api/state` 返回含 `cash_usdt`、`positions`、`totals` 的 JSON。

- [ ] **Step 4: Commit**

```bash
git add server/src/server.js server/src/index.js
git commit -m "feat: Express API — state/transactions/settings/prices"
```

---

### Task 11: 导出 JSON / CSV

**Files:**
- Modify: `server/src/server.js`

- [ ] **Step 1: 追加导出路由**（放在 `return app;` 之前）

```js
  app.get('/api/export', (req, res) => {
    try {
      const transactions = repo.listTransactions();
      const stamp = new Date().toISOString().slice(0, 10);
      if (req.query.format === 'csv') {
        const header = 'id,ts,type,symbol,quantity,total_usdt,unit_price,note\n';
        const rows = transactions.map((t) => {
          const unit = t.quantity ? (t.total_usdt / t.quantity).toFixed(8) : '';
          const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
          return [t.id, t.ts, t.type, t.symbol ?? '', t.quantity ?? '', t.total_usdt, unit, esc(t.note)].join(',');
        });
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="transactions-${stamp}.csv"`);
        return res.send(header + rows.join('\n'));
      }
      res.setHeader('Content-Disposition', `attachment; filename="ledger-${stamp}.json"`);
      res.json({ exported_at: new Date().toISOString(), settings: repo.getSettings(), transactions });
    } catch (err) { fail(res, err, 500); }
  });
```

- [ ] **Step 2: 冒烟验证**

```bash
cd server && (node src/index.js &) && sleep 1 && curl -s "localhost:3001/api/export?format=csv" | head -3; pkill -f "node src/index.js"
```

Expected: CSV 表头 + 一条 BUY 记录。

- [ ] **Step 3: Commit**

```bash
git add server/src/server.js
git commit -m "feat: 导出 JSON / CSV"
```

---

### Task 12: API 冒烟测试

**Files:**
- Create: `server/src/api.test.js`

- [ ] **Step 1: 写测试**（用内存库，不碰真实 `data/ledger.db`）

```js
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

before(async () => {
  const db = new Database(':memory:');
  db.exec(fs.readFileSync(path.join(srcDir, 'schema.sql'), 'utf8'));
  const app = createApp({ repo: createRepository(db), priceService: priceStub });
  server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());

test('买入后持仓与现金正确，卖出超额被拒绝', async () => {
  const post = (body) => fetch(`${base}/api/transactions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });

  assert.equal((await post({ type: 'DEPOSIT', total_usdt: 100000 })).status, 201);
  assert.equal((await post({ type: 'BUY', symbol: 'BTC', quantity: 1, total_usdt: 60000 })).status, 201);

  const bad = await post({ type: 'SELL', symbol: 'BTC', quantity: 2, total_usdt: 90000 });
  assert.equal(bad.status, 400);
  assert.match((await bad.json()).error, /卖出数量超过持仓/);

  const state = await (await fetch(`${base}/api/state`)).json();
  const btc = state.positions.find((p) => p.symbol === 'BTC');
  assert.equal(btc.quantity, 1);
  assert.equal(btc.avg_cost, 60000);
  assert.equal(state.cash_usdt, 40000);
  assert.equal(state.totals.invested_capital, 100000);
});

test('删除后重放，数字回到未录入时的状态', async () => {
  const before = await (await fetch(`${base}/api/state`)).json();
  const created = await (await fetch(`${base}/api/transactions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'BUY', symbol: 'ETH', quantity: 5, total_usdt: 15000 }),
  })).json();

  await fetch(`${base}/api/transactions/${created.id}`, { method: 'DELETE' });
  const after = await (await fetch(`${base}/api/state`)).json();

  assert.equal(after.cash_usdt, before.cash_usdt);
  assert.ok(!after.positions.some((p) => p.symbol === 'ETH' && p.quantity > 0));
});
```

- [ ] **Step 2: 运行确认通过**

```bash
cd server && node --test src/
```

Expected: 11 passing（9 个引擎 + 2 个 API）

- [ ] **Step 3: Commit**

```bash
git add server/src/api.test.js
git commit -m "test: API 冒烟测试 — 买入、超额拒绝、删除后重放"
```

---

### Task 13: 前端骨架 — API 封装与格式化

**Files:**
- Create: `web/src/main.tsx`, `web/src/api.ts`, `web/src/format.ts`, `web/src/styles.css`, `web/tsconfig.json`

- [ ] **Step 1: 写 tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022", "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext", "moduleResolution": "bundler", "jsx": "react-jsx",
    "strict": true, "noEmit": true, "skipLibCheck": true, "isolatedModules": true
  },
  "include": ["src"]
}
```

- [ ] **Step 2: 写 api.ts**

```ts
export type Transaction = {
  id: number; ts: string; type: 'BUY' | 'SELL' | 'DEPOSIT' | 'WITHDRAW';
  symbol: string | null; quantity: number | null; total_usdt: number; note: string | null;
};

export type Position = {
  symbol: string; quantity: number; avg_cost: number; cost_basis: number;
  current_price: number | null; market_value: number | null;
  unrealized_pnl: number | null; unrealized_pnl_pct: number | null;
  price_stale: boolean; inconsistent: boolean; weight: number | null;
};

export type State = {
  settings: { initial_capital_usdt: number; price_ttl_seconds: number };
  transactions: Transaction[];
  cash_usdt: number;
  positions: Position[];
  totals: {
    invested_capital: number; market_value_total: number; cost_basis_total: number;
    unrealized_pnl_total: number | null; realized_pnl_total: number;
    net_worth: number; roi_pct: number | null;
  };
  warnings: string[];
  prices: Record<string, { price: number | null; stale: boolean; fetched_at: string | null; source: string }>;
};

async function req<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `请求失败 ${res.status}`);
  return res.status === 204 ? (undefined as T) : await res.json();
}

const json = (body: unknown) => ({ headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

export const api = {
  getState: () => req<State>('/api/state'),
  addTransaction: (body: Record<string, unknown>) => req<Transaction>('/api/transactions', { method: 'POST', ...json(body) }),
  deleteTransaction: (id: number) => req(`/api/transactions/${id}`, { method: 'DELETE' }),
  restoreTransaction: (id: number) => req(`/api/transactions/${id}/restore`, { method: 'POST' }),
  refreshPrices: () => req('/api/prices/refresh', { method: 'POST' }),
  setPrice: (symbol: string, price: number) => req(`/api/prices/${symbol}`, { method: 'PUT', ...json({ price }) }),
  updateSettings: (body: Record<string, unknown>) => req('/api/settings', { method: 'PUT', ...json(body) }),
};
```

- [ ] **Step 3: 写 format.ts**

```ts
export const fmtUsdt = (n: number | null | undefined) =>
  n == null || !Number.isFinite(n) ? '—' : n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const fmtQty = (n: number | null | undefined) =>
  n == null || !Number.isFinite(n) ? '—' : String(Number(n.toFixed(8)));

export const fmtPrice = (n: number | null | undefined) =>
  n == null || !Number.isFinite(n) ? '—' : n.toLocaleString('zh-CN', { maximumFractionDigits: 8 });

export const fmtPct = (n: number | null | undefined) =>
  n == null || !Number.isFinite(n) ? '—' : `${(n * 100).toFixed(2)}%`;

export const fmtSigned = (n: number | null | undefined) =>
  n == null || !Number.isFinite(n) ? '—' : `${n > 0 ? '+' : ''}${fmtUsdt(n)}`;

/** 后端存 UTC，前端按本地时区展示 */
export const fmtTime = (iso: string) =>
  new Date(iso).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });

export const fmtAgo = (iso: string | null) => {
  if (!iso) return '—';
  const mins = Math.floor((Date.now() - Date.parse(iso)) / 60000);
  if (mins < 1) return '刚刚';
  if (mins < 60) return `${mins} 分钟前`;
  return `${Math.floor(mins / 60)} 小时前`;
};
```

- [ ] **Step 4: 写 main.tsx 与 styles.css**

`main.tsx`：

```tsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(<App />);
```

`styles.css`：深色卡片 + 表格的基础样式，数值列右对齐，正收益绿色（`#0ecb81`）、负收益红色（`#f6465d`），`table` 全宽、`border-collapse: collapse`。

- [ ] **Step 5: Commit**

```bash
git add web/src web/tsconfig.json
git commit -m "feat: 前端骨架 — API 封装与格式化工具"
```

---

### Task 14: 汇总卡片与持仓表格

**Files:**
- Create: `web/src/components/SummaryCards.tsx`, `web/src/components/PositionsTable.tsx`

- [ ] **Step 1: 写 SummaryCards.tsx**

```tsx
import type { State } from '../api';
import { fmtUsdt, fmtPct, fmtSigned } from '../format';

export default function SummaryCards({ state }: { state: State }) {
  const t = state.totals;
  const cards = [
    { label: '净资产', value: fmtUsdt(t.net_worth) },
    { label: '总收益率', value: fmtPct(t.roi_pct), tone: t.roi_pct == null ? '' : t.roi_pct >= 0 ? 'up' : 'down' },
    { label: 'USDT 余额', value: fmtUsdt(state.cash_usdt), tone: state.cash_usdt < 0 ? 'down' : '' },
    { label: '持仓市值', value: fmtUsdt(t.market_value_total) },
    { label: '浮动盈亏', value: fmtSigned(t.unrealized_pnl_total), tone: (t.unrealized_pnl_total ?? 0) >= 0 ? 'up' : 'down' },
    { label: '已实现盈亏', value: fmtSigned(t.realized_pnl_total), tone: t.realized_pnl_total >= 0 ? 'up' : 'down' },
    { label: '总投入本金', value: fmtUsdt(t.invested_capital) },
  ];
  return (
    <section className="cards">
      {cards.map((c) => (
        <div className="card" key={c.label}>
          <span className="card-label">{c.label}</span>
          <strong className={`card-value ${c.tone}`}>{c.value}</strong>
        </div>
      ))}
      {state.warnings.map((w) => <p className="warn" key={w}>{w}</p>)}
    </section>
  );
}
```

- [ ] **Step 2: 写 PositionsTable.tsx**

```tsx
import type { Position, State } from '../api';
import { fmtUsdt, fmtQty, fmtPrice, fmtPct, fmtSigned, fmtAgo } from '../format';

/** 定义在组件外：写在组件内部会导致每次渲染都是新的组件类型，表格行被整体重挂载 */
function PriceCell({ p, fetchedAt }: { p: Position; fetchedAt: string | null }) {
  return (
    <td>
      {fmtPrice(p.current_price)}
      {p.current_price != null && (
        <span className={p.price_stale ? 'stale' : 'muted'}>
          {p.price_stale ? ' 已过期' : ` ${fmtAgo(fetchedAt)}`}
        </span>
      )}
    </td>
  );
}

export default function PositionsTable({ state, showClosed, onToggleClosed }: {
  state: State; showClosed: boolean; onToggleClosed: (v: boolean) => void;
}) {
  const rows = state.positions
    .filter((p) => showClosed || p.quantity > 1e-8)
    .sort((a, b) => (b.market_value ?? 0) - (a.market_value ?? 0));

  const cashWeight = state.totals.net_worth > 0 ? state.cash_usdt / state.totals.net_worth : null;

  return (
    <section>
      <header className="section-head">
        <h2>持仓</h2>
        <label><input type="checkbox" checked={showClosed} onChange={(e) => onToggleClosed(e.target.checked)} /> 显示已清仓</label>
      </header>
      {rows.length === 0 ? <p className="muted">还没有持仓，先在下方录入一笔买入。</p> : (
        <table>
          <thead>
            <tr><th>币种</th><th>数量</th><th>均价</th><th>现价</th><th>市值</th><th>浮盈</th><th>收益率</th><th>占比</th></tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.symbol} className={p.inconsistent ? 'row-bad' : ''}>
                <td>{p.symbol}{p.inconsistent && <span className="warn-inline"> 数据不一致</span>}</td>
                <td className="num">{fmtQty(p.quantity)}</td>
                <td className="num">{fmtPrice(p.avg_cost)}</td>
                <PriceCell p={p} fetchedAt={state.prices[p.symbol]?.fetched_at ?? null} />
                <td className="num">{fmtUsdt(p.market_value)}</td>
                <td className={`num ${(p.unrealized_pnl ?? 0) >= 0 ? 'up' : 'down'}`}>{fmtSigned(p.unrealized_pnl)}</td>
                <td className={`num ${(p.unrealized_pnl_pct ?? 0) >= 0 ? 'up' : 'down'}`}>{fmtPct(p.unrealized_pnl_pct)}</td>
                <td className="num">{fmtPct(p.weight)}</td>
              </tr>
            ))}
            <tr className="row-cash">
              <td>USDT 现金</td>
              <td className="num">{fmtUsdt(state.cash_usdt)}</td>
              <td className="num">—</td>
              <td className="num">1.00</td>
              <td className="num">{fmtUsdt(state.cash_usdt)}</td>
              <td className="num">—</td>
              <td className="num">—</td>
              <td className="num">{fmtPct(cashWeight)}</td>
            </tr>
          </tbody>
        </table>
      )}
    </section>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add web/src/components/SummaryCards.tsx web/src/components/PositionsTable.tsx
git commit -m "feat: 汇总卡片与持仓表格"
```

---

### Task 15: 录入表单与流水表格

**Files:**
- Create: `web/src/components/TransactionForm.tsx`, `web/src/components/TransactionList.tsx`

- [ ] **Step 1: 写 TransactionForm.tsx**

```tsx
import { useState } from 'react';
import { api } from '../api';
import { fmtPrice } from '../format';

type Type = 'BUY' | 'SELL' | 'DEPOSIT' | 'WITHDRAW';

export default function TransactionForm({ onDone, onError }: { onDone: () => void; onError: (m: string) => void }) {
  const [type, setType] = useState<Type>('BUY');
  const [symbol, setSymbol] = useState('');
  const [quantity, setQuantity] = useState('');
  const [total, setTotal] = useState('');
  const [note, setNote] = useState('');
  const [ts, setTs] = useState('');

  const isTrade = type === 'BUY' || type === 'SELL';
  const qtyNum = Number(quantity);
  const totalNum = Number(total);
  const unitPrice = isTrade && qtyNum > 0 && totalNum > 0 ? totalNum / qtyNum : null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.addTransaction({
        type,
        ...(isTrade ? { symbol, quantity: qtyNum } : {}),
        total_usdt: totalNum,
        note: note || undefined,
        ts: ts ? new Date(ts).toISOString() : undefined,
      });
      setSymbol(''); setQuantity(''); setTotal(''); setNote(''); setTs('');
      onDone();
    } catch (err) { onError((err as Error).message); }
  }

  return (
    <form onSubmit={submit} className="form">
      <select value={type} onChange={(e) => setType(e.target.value as Type)}>
        <option value="BUY">买入</option><option value="SELL">卖出</option>
        <option value="DEPOSIT">入金</option><option value="WITHDRAW">出金</option>
      </select>
      {isTrade && <>
        <input placeholder="币种 如 BTC" value={symbol} onChange={(e) => setSymbol(e.target.value)} required />
        <input placeholder="数量" value={quantity} onChange={(e) => setQuantity(e.target.value)} inputMode="decimal" required />
      </>}
      <input placeholder="USDT 金额" value={total} onChange={(e) => setTotal(e.target.value)} inputMode="decimal" required />
      <input type="datetime-local" value={ts} onChange={(e) => setTs(e.target.value)} />
      <input placeholder="备注（可选）" value={note} onChange={(e) => setNote(e.target.value)} />
      <button type="submit">记录</button>
      {unitPrice != null && <span className="muted">单价 {fmtPrice(unitPrice)} USDT</span>}
    </form>
  );
}
```

- [ ] **Step 2: 写 TransactionList.tsx**

```tsx
import { useState } from 'react';
import { api, type Transaction } from '../api';
import { fmtUsdt, fmtQty, fmtPrice, fmtTime } from '../format';

const TYPE_LABEL: Record<string, string> = { BUY: '买入', SELL: '卖出', DEPOSIT: '入金', WITHDRAW: '出金' };

export default function TransactionList({ transactions, onChanged }: {
  transactions: Transaction[]; onChanged: () => void;
}) {
  const [filter, setFilter] = useState('');
  const [undone, setUndone] = useState<Transaction | null>(null);

  const rows = [...transactions]
    .filter((t) => !filter || t.symbol === filter)
    .reverse();

  async function remove(t: Transaction) {
    await api.deleteTransaction(t.id);
    setUndone(t);
    onChanged();
  }

  async function undo() {
    if (!undone) return;
    await api.restoreTransaction(undone.id);
    setUndone(null);
    onChanged();
  }

  return (
    <section>
      <header className="section-head">
        <h2>流水</h2>
        <input placeholder="按币种筛选" value={filter} onChange={(e) => setFilter(e.target.value.toUpperCase())} />
      </header>
      {undone && <p className="warn">已删除一条 {TYPE_LABEL[undone.type]} 记录 <button onClick={undo}>撤销</button></p>}
      <table>
        <thead><tr><th>时间</th><th>类型</th><th>币种</th><th>数量</th><th>单价</th><th>USDT 金额</th><th>备注</th><th></th></tr></thead>
        <tbody>
          {rows.map((t) => (
            <tr key={t.id}>
              <td>{fmtTime(t.ts)}</td>
              <td className={t.type === 'BUY' ? 'down' : t.type === 'SELL' ? 'up' : ''}>{TYPE_LABEL[t.type]}</td>
              <td>{t.symbol ?? '—'}</td>
              <td className="num">{fmtQty(t.quantity)}</td>
              <td className="num">{t.quantity ? fmtPrice(t.total_usdt / t.quantity) : '—'}</td>
              <td className="num">{fmtUsdt(t.total_usdt)}</td>
              <td>{t.note ?? ''}</td>
              <td><button onClick={() => remove(t)}>删除</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add web/src/components/TransactionForm.tsx web/src/components/TransactionList.tsx
git commit -m "feat: 录入表单与流水表格（含删除撤销）"
```

---

### Task 16: 设置面板与 App 装配

**Files:**
- Create: `web/src/components/SettingsPanel.tsx`, `web/src/App.tsx`

- [ ] **Step 1: 写 SettingsPanel.tsx**

```tsx
import { useState } from 'react';
import { api, type State } from '../api';

export default function SettingsPanel({ state, onChanged }: { state: State; onChanged: () => void }) {
  const [capital, setCapital] = useState(String(state.settings.initial_capital_usdt));
  const [symbol, setSymbol] = useState('');
  const [price, setPrice] = useState('');
  const [busy, setBusy] = useState(false);

  async function saveCapital() {
    await api.updateSettings({ initial_capital_usdt: Number(capital) });
    onChanged();
  }

  async function refresh() {
    setBusy(true);
    try { await api.refreshPrices(); } finally { setBusy(false); }
    onChanged();
  }

  async function overridePrice() {
    await api.setPrice(symbol.toUpperCase(), Number(price));
    setSymbol(''); setPrice('');
    onChanged();
  }

  return (
    <section>
      <header className="section-head"><h2>设置</h2></header>
      <div className="form">
        <label>初始本金 USDT</label>
        <input value={capital} onChange={(e) => setCapital(e.target.value)} inputMode="decimal" />
        <button onClick={saveCapital}>保存</button>
      </div>
      <div className="form">
        <button onClick={refresh} disabled={busy}>{busy ? '刷新中…' : '刷新价格'}</button>
        <input placeholder="币种" value={symbol} onChange={(e) => setSymbol(e.target.value)} />
        <input placeholder="手动价格" value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" />
        <button onClick={overridePrice}>覆盖价格</button>
      </div>
      <p className="muted">
        <a href="/api/export?format=csv">导出 CSV</a> · <a href="/api/export">导出 JSON</a>
      </p>
    </section>
  );
}
```

- [ ] **Step 2: 写 App.tsx**

```tsx
import { useCallback, useEffect, useState } from 'react';
import { api, type State } from './api';
import SummaryCards from './components/SummaryCards';
import PositionsTable from './components/PositionsTable';
import TransactionForm from './components/TransactionForm';
import TransactionList from './components/TransactionList';
import SettingsPanel from './components/SettingsPanel';

export default function App() {
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState('');
  const [showClosed, setShowClosed] = useState(false);

  const reload = useCallback(async () => {
    try { setState(await api.getState()); setError(''); }
    catch (err) { setError((err as Error).message); }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  if (!state) return <main><p>{error || '加载中…'}</p></main>;

  return (
    <main>
      <h1>持仓成本记录器</h1>
      {error && <p className="warn" onClick={() => setError('')}>{error}（点击关闭）</p>}
      <SummaryCards state={state} />
      <TransactionForm onDone={reload} onError={setError} />
      <PositionsTable state={state} showClosed={showClosed} onToggleClosed={setShowClosed} />
      <TransactionList transactions={state.transactions} onChanged={reload} />
      <SettingsPanel state={state} onChanged={reload} />
    </main>
  );
}
```

- [ ] **Step 3: 类型检查与构建**

```bash
npm --prefix web run build
```

Expected: 无 TS 错误，`web/dist/` 生成。

- [ ] **Step 4: Commit**

```bash
git add web/src/App.tsx web/src/components/SettingsPanel.tsx
git commit -m "feat: 设置面板与 App 装配"
```

---

### Task 17: 端到端手工验收

**Files:** 无新增

- [ ] **Step 1: 启动**

```bash
npm run dev
```

打开 `http://localhost:5173`。

- [ ] **Step 2: 走一遍主流程并对着算**

1. 设置里填初始本金 `100000` → 保存
2. 录入买入：BTC / 数量 `1` / USDT `60000` → USDT 余额应为 `40000`，BTC 均价 `60000`
3. 再录入买入：BTC / 数量 `1` / USDT `80000` → BTC 数量 `2`，均价 `70000`，余额 `-40000`（标红并提示漏记入金，这是预期行为）
4. 补录入金 `50000` → 余额 `10000`
5. 录入卖出：BTC / 数量 `0.5` / USDT `45000` → BTC 数量 `1.5`，**均价仍为 `70000`**，已实现盈亏 `10000`（45000 − 70000×0.5），余额 `55000`
6. 等价格刷新后：BTC 现价有值，浮盈与收益率出现，占比之和（含现金的隐含项）不超过 100%
7. 删除第 5 步那笔卖出 → 数量回到 `2`，已实现盈亏 `0`，余额回到 `10000`

Expected: 每一步数字与上表一致。

- [ ] **Step 3: 删除卖出导致的历史超额场景**

录入买入 BTC 1 个，再录卖出 1 个（正常），然后删除那笔买入 → 持仓表出现 BTC 行并标"数据不一致"，页面顶部出现对应 warning。

Expected: 不崩溃，warning 可见。（这是删除导致的负仓位，与新增交易时的硬拒绝是两回事。）

- [ ] **Step 4: 验证备份**

```bash
ls data/backups/
```

Expected: 有 `ledger-<今天>.db`。

- [ ] **Step 5: 提交最终状态**

```bash
git add -A && git commit -m "chore: 端到端验收通过"
git --no-pager log --oneline main..HEAD
```

**不要合并进 `main`**，也不要切回 `main`。停在这里等用户确认。

---

## 自检清单

- Spec 第 4 节（计算引擎）：Task 3–7
- Spec 第 5 节（价格服务）：Task 9，接入见 Task 10 的 `/api/state` 与 `/api/prices/refresh`
- Spec 第 6 节（API）：Task 10、11（导出路由在 Task 11）
- Spec 第 7 节（界面）：Task 14–16
- Spec 第 8 节（安全与备份）：`127.0.0.1` 见 Task 10，`data/` gitignore 见 Task 1 已存在，备份见 Task 2
- Spec 第 9 节（测试）：Task 3–7 引擎单测、Task 12 API 冒烟
- Spec 第 10 节（顺序）：P1 = Task 1–7，P2 = Task 8–12，P3 = Task 13–16，P4 = Task 11 + 17
