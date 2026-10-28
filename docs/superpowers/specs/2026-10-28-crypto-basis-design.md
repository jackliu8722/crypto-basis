# crypto-basis — 设计文档

日期：2026-10-28
状态：待用户 review

## 1. 目标与非目标

### 目标

手工录入每一笔 USDT 计价的现货交易，自动得出每个币的持仓成本、当前市值与收益。定位是**个人快速记账工具**，数字求"够准、能对上账"，不追求账本级的会计精确度。

用户明确的核心流程：

1. 录入一笔交易：币种、数量、涉及的 USDT 金额、买还是卖
2. 卖出后自动减少持仓，USDT 加回现金账户
3. 能删除记录，删除后所有数字自动回到正确状态
4. 联网取当前价格，显示收益率

### 非目标（第一版明确不做）

- 合约、杠杆、永续、期权
- 多交易所 / 多账户
- 非 USDT 计价资产
- 手续费（用户明确："本来就是一个大概记录工具"，不记录）
- 资产转入（转入 BTC 等存量币）—— 用户确认全部从 USDT 开始买
- FIFO / 批次级成本核算
- 交易所 API 自动同步、K 线图表、用户登录
- 交易编辑（编辑 = 删除 + 重新录入）

## 2. 技术选型

| 层 | 选择 | 理由 |
|---|---|---|
| 后端 | Node 22 + Express + better-sqlite3 | 同步 API，单文件数据库，备份就是拷贝文件 |
| 前端 | React + Vite + TypeScript，手写 CSS | 不引入 UI 组件库和图表库，第一版只有表格和卡片 |
| 存储 | SQLite，文件 `data/ledger.db`，开 WAL | 避免多标签页同时打开时锁库 |

**为什么不用 `node:sqlite`**：Node 22.22 仍需 `--experimental-sqlite` 启动标志并打印实验性警告，不适合日常使用。`better-sqlite3` 有预编译二进制，macOS 上 `npm install` 直接下载，无需 node-gyp 编译。

**目录结构**

```
server/    Express 服务，端口 3001
web/       Vite + React，端口 5173，/api 代理到 3001
data/      ledger.db + backups/（gitignore）
```

根目录 `npm run dev` 用 `concurrently` 同时起两个进程。

## 3. 数据模型

### settings（单行表）

| 字段 | 类型 | 说明 |
|---|---|---|
| id | INTEGER PK | 固定为 1 |
| initial_capital_usdt | REAL | 初始本金，默认 0 |
| price_ttl_seconds | INTEGER | 价格缓存有效期，默认 300 |

初始本金是现金账户的起点，等于"记账开始时你账户里已有的 USDT"。它不生成流水记录（不然流水列表里会冒出一条你没录过的记录）。汇总区另算"总投入本金 = 初始本金 + 入金 − 出金"。

### transactions

| 字段 | 类型 | 说明 |
|---|---|---|
| id | INTEGER PK | |
| ts | TEXT | 交易发生时间，ISO 8601 UTC |
| type | TEXT | `BUY` / `SELL` / `DEPOSIT` / `WITHDRAW` |
| symbol | TEXT | 大写标准化（BTC、ETH），出入金为 NULL |
| quantity | REAL | 币数量，买卖必填且 > 0 |
| total_usdt | REAL | 涉及的 USDT 总额，买卖 > 0，出入金 = 金额 |
| note | TEXT | 备注，可空 |
| created_at | TEXT | 录入时间 |
| deleted_at | TEXT | 软删除标记，NULL 表示未删除 |

**不存单价**：单价由 `total_usdt / quantity` 派生。用户录入的是"涉及多少 USDT"，那才是真实金额，单价是算出来的。

**没有手续费字段**：用户明确不记录。

### prices（缓存）

`symbol` PK、`price_usdt` REAL、`source` TEXT、`fetched_at` TEXT

### price_overrides（手动覆盖）

`symbol` PK、`price_usdt` REAL、`updated_at` TEXT

## 4. 计算引擎

核心是一个**纯函数**：

```ts
computeState(transactions, settings, priceMap) => State
```

不读数据库、不发网络请求，输入决定输出，因此可单测。

### 重放流程

取 `deleted_at IS NULL` 的记录，按 `ts ASC, id ASC` 排序后依次应用：

**BUY**
```
cash            -= total_usdt
qty             += quantity
cost_basis      += total_usdt
avg_cost         = cost_basis / qty
```

**SELL**
```
realized        += total_usdt - avg_cost * quantity
cash            += total_usdt
cost_basis      -= avg_cost * quantity
qty             -= quantity
```
卖出按当前均价扣减成本，**剩余持仓的均价不变**（移动加权平均的定义）。

**DEPOSIT**  `cash += total_usdt`
**WITHDRAW** `cash -= total_usdt`

### 派生指标

单币：

- `market_value = qty × current_price`
- `unrealized_pnl = market_value − cost_basis`
- `unrealized_pnl_pct = (current_price − avg_cost) / avg_cost`

全局：

- `cash_usdt` USDT 余额
- `invested_capital = initial_capital + deposits − withdraws` 总投入本金
- `net_worth = cash_usdt + Σ market_value` 净资产
- `total_unrealized = Σ unrealized_pnl` 浮动盈亏
- `total_realized` 已实现盈亏（卖出累计，不冲减浮盈）
- `roi_pct = (net_worth − invested_capital) / invested_capital` 总收益率

### 边界规则

**卖出数量不得超过持仓量（硬拒绝）**。API 返回 400，UI 提示"当前仅持有 X 个 BTC"。这是用户明确要求的约束。

**买入时 USDT 余额可以为负**：允许保存，UI 上把余额标红并提示"余额为负，可能漏记入金"。因为初始本金可能没填准，硬拒绝反而碍事。

**数量为 0 的持仓**默认从持仓表隐藏，汇总区提供"显示已清仓"开关（已实现盈亏保留可见）。

**成本价口径说明**：采用标准会计口径——卖出不降低剩余持仓的成本价。另一种常见口径（"回本口径"：成本 = 总买入 − 总卖出）会让成本价随卖出下降，但超额回本后成本价变负、收益率公式失效。两种口径的**总收益一致**，只是浮盈/已实现的切分不同。本工具用标准口径保证收益率公式始终有效。

**精度**：金额用 `number` 计算，展示时 USDT 保留 2 位小数、币数量保留 8 位。数量比较用 `1e-8` 容差判定是否为 0。不追求分位级精确。

**时间与时区**：所有 `ts` 以 UTC 存储，前端按本地时区显示。表单用 `datetime-local` 输入，提交前转 UTC。

**乱序录入**：因为按 `ts` 排序重放，先录 10/28 的卖单、后补录 10/01 的买单也不会算错——这是重放架构的直接收益。注意：在补录买单之前查询，会因"卖出超持仓"被拒绝，这是预期行为。

## 5. 价格服务

`getPrices(symbols)` 的取值优先级：

1. `price_overrides` 中手动填写的价格（最高优先级）
2. `prices` 缓存中 `fetched_at` 在 TTL 内的价格
3. CoinGecko 免费 API `GET /api/v3/simple/price?ids=...&vs_currencies=usd`，**一次批量请求所有持仓币种**
4. 全部失败 → 返回上次缓存价格并标记 `stale`
5. 连缓存都没有 → 返回 `null`，前端该列显示 `—`

**symbol → coingecko_id 映射**：内置约 30 个主流币的映射表优先；未命中则查本地缓存的 `/api/v3/coins/list`（懒加载一次，存 `data/coingecko-coins.json`，每天刷新，symbol 大写匹配取第一个）；仍查不到则标记为"未知币种"，需手动填价。

**USDT 按 1:1 美元处理**，且不进入持仓列表（它就是现金账户本身）。

**代理（实测必需）**：开发机在国内网络下，CoinGecko / Binance / OKX 均不可直连（返回 000），但经 `http://127.0.0.1:7890` 代理三者都通。因此 `settings.proxy_url` 可配置，取价时通过 `undici` 的 `ProxyAgent` 发出；未配置时回退读 `HTTPS_PROXY` / `HTTP_PROXY` 环境变量。取不到价时按上面的降级路径处理，并在设置面板提示"未填代理地址时通常取不到行情，可手动填价"。

**为什么用 `undici` 而不是内置 fetch**：Node 内置 fetch 不读取代理环境变量，且 npm 安装的 undici 的 `setGlobalDispatcher` 不影响内置实例（两者是不同副本）。所以 priceService 直接 `import { fetch, ProxyAgent } from 'undici'`，保证 dispatcher 与 fetch 同源。

**代理只在服务端生效**：浏览器只与本机 3001/5173 通信，是 Node 后端去访问 CoinGecko，所以代理配在后端，浏览器不需要任何设置。

**启动参数**（优先级从高到低）：

```bash
node src/index.js --proxy http://127.0.0.1:7890   # 命令行指定（最高优先级）
node src/index.js --no-proxy                      # 显式禁用，即使设置里填了也不用
HTTPS_PROXY=http://127.0.0.1:7890 npm run dev     # 环境变量
```

都不给时，回落读 `settings.proxy_url`（设置面板里填的值）。启动时会在控制台打印当前生效的代理地址。

**访问方式**：日常使用是**单进程**——Express 直接托管 `web/dist` 静态产物，只监听 `127.0.0.1:3001`，浏览器打开 `http://127.0.0.1:3001` 即可。局域网内其他设备访问不到，这是刻意的，账目数据不应暴露到网络上。

**启动脚本** `./start.command`（macOS 双击即可运行，或终端执行 `npm start`）：自动装依赖、前端源码有变动时自动重新构建、启动后端、打开浏览器。参数原样透传给后端：

```bash
./start.command                                  # 默认 3001
./start.command --proxy http://127.0.0.1:7890    # 指定行情代理
./start.command --no-proxy                       # 不用代理
./start.command --port 8080 --no-open            # 换端口且不自动开浏览器
```

`npm run dev` 仍保留双进程（Vite HMR + `node --watch`），只在改前端代码时用它；日常用单进程。前端未构建时访问会返回明确提示而不是空白页。

**限流**：CoinGecko 免费额度约 10–30 req/min。批量请求 + 5 分钟 TTL + 失败静默降级，不会触发限流。

**刷新时机**：前端加载 `/api/state` 时后端顺带检查并刷新过期价格；另提供手动"刷新价格"按钮强制刷新。

## 6. API

```
GET    /api/state                      现金/持仓/汇总/价格时间戳，一次性返回
GET    /api/transactions?symbol=&limit=
POST   /api/transactions               买/卖/入金/出金
DELETE /api/transactions/:id           软删除
POST   /api/transactions/:id/restore   恢复误删
PUT    /api/prices/:symbol             手动覆盖价格
POST   /api/prices/refresh             强制刷新全部持仓币种
GET    /api/settings
PUT    /api/settings
GET    /api/export?format=json|csv     导出流水与持仓
```

所有金额在 API 层以数字传输，不做四舍五入；格式化只发生在前端渲染时。

## 7. 界面

单页，四个区块：

**1. 顶部汇总卡片**
净资产 · 总收益率 · USDT 余额 · 持仓市值 · 浮动盈亏 · 已实现盈亏 · 总投入本金

**2. 持仓表格**
币种 · 数量 · 均价 · 现价（带"3 分钟前"或灰色"已过期"标记）· 市值 · 浮盈 · 收益率 · 占比

占比分母为**净资产**（含 USDT 现金），所以各持仓占比之和 ≤ 100%，差额就是现金占比。持仓表底部固定显示一行「USDT 现金」及其占比，使整表相加为 100%。

**3. 流水表格**
时间 · 类型 · 币种 · 数量 · 单价 · USDT 金额 · 备注 · 删除按钮

支持按币种筛选。删除不二次弹窗但提供"撤销"提示条，或删除后立即显示可恢复的提示（软删除已实现）。

**4. 录入表单**
类型切换时字段动态增减：

- 买入/卖出：币种、数量、USDT 金额（实时算单价）、时间、备注
- 入金/出金：USDT 金额、时间、备注

买入时实时预览"这笔成交后均价将变为 X"。

**5. 设置区**
初始本金、价格刷新按钮、导出 JSON/CSV。

## 8. 安全与备份

- 服务只监听 `127.0.0.1`，不暴露到局域网
- `data/` 加入 `.gitignore`（含真实持仓金额，不应进版本库）
- 每次服务启动自动拷贝一份快照到 `data/backups/ledger-YYYYMMDD.db`，保留最近 7 份
- 手动导出 JSON / CSV

## 9. 测试

`node:test` 覆盖计算引擎（纯函数，无需 mock）：

- 单次买入：数量、成本、现金扣减
- 多次买入：加权均价正确
- 部分卖出：已实现盈亏正确，剩余均价不变
- 全部卖出：持仓归零，已实现保留
- 卖出超过持仓：被拒绝
- 入金/出金：现金与"总投入本金"正确
- 删除一笔后重放：数字与未录该笔时完全一致
- 乱序 `ts`：结果与顺序录入一致
- 价格缺失：市值与浮盈为 null，不影响现金与已实现

API 层跑冒烟测试（起服务、插数据、断言 `/api/state`）。

## 10. 实施顺序

- **P1** 数据层 + 计算引擎 + 单测
- **P2** Express API + 价格服务
- **P3** 前端界面
- **P4** 导出、设置、备份与打磨
