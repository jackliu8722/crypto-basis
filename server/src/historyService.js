import { sortTransactions } from './engine.js';

const EPS = 1e-8;
/** CoinGecko 免费接口的历史深度上限 */
const MAX_DAYS = 365;

const pad = (n) => String(n).padStart(2, '0');

/** 按本地时区取日期，避免 UTC 日切导致差一天 */
export function dayOf(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function today() {
  return dayOf(Date.now());
}

export function addDays(day, n) {
  const [y, m, d] = day.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + n);
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}

export function enumerateDays(fromDay, toDay) {
  const out = [];
  const [fy, fm, fd] = fromDay.split('-').map(Number);
  const [ty, tm, td] = toDay.split('-').map(Number);
  const cur = new Date(fy, fm - 1, fd);
  const end = new Date(ty, tm - 1, td);
  while (cur <= end) {
    out.push(`${cur.getFullYear()}-${pad(cur.getMonth() + 1)}-${pad(cur.getDate())}`);
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

export function createHistoryService(db, priceService) {
  const insertPrice = db.prepare(`
    INSERT INTO price_history (symbol, day, price_usdt, source) VALUES (?, ?, ?, ?)
    ON CONFLICT(symbol, day) DO UPDATE SET price_usdt = excluded.price_usdt, source = excluded.source
  `);
  const coverage = db.prepare(`SELECT MIN(day) AS minDay, MAX(day) AS maxDay FROM price_history WHERE symbol = ?`);
  const rangePrices = db.prepare(
    `SELECT day, price_usdt FROM price_history WHERE symbol = ? AND day BETWEEN ? AND ? ORDER BY day`,
  );
  const latestBefore = db.prepare(
    `SELECT day, price_usdt FROM price_history WHERE symbol = ? AND day <= ? ORDER BY day DESC LIMIT 1`,
  );

  /** 抓一个币的历史日线并落库；返回抓取状态 */
  async function fetchSymbolHistory(symbol, fromDay, toDay) {
    const id = await priceService.resolveId(symbol);
    if (!id) return { ok: false, reason: 'no-id' };

    const spanDays =
      Math.round((Date.parse(`${toDay}T00:00:00`) - Date.parse(`${fromDay}T00:00:00`)) / 86400000) + 1;
    const days = Math.min(Math.max(spanDays, 2), MAX_DAYS);

    try {
      const data = await priceService.fetchJson(
        `https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=${days}`,
      );
      // 接口返回的粒度不固定（可能几小时一个点），按天聚合，保留当天最后一个点作为收盘价
      const byDay = new Map();
      for (const [ts, price] of data.prices ?? []) {
        if (!Number.isFinite(price)) continue;
        byDay.set(dayOf(ts), price);
      }
      let n = 0;
      for (const [day, price] of byDay) {
        if (day < fromDay || day > toDay) continue;
        insertPrice.run(symbol, day, price, 'coingecko');
        n++;
      }
      return { ok: n > 0, points: n };
    } catch (err) {
      return { ok: false, reason: err.message };
    }
  }

  return {
    /** 补齐缺失区间；已覆盖到昨天且起点够早则跳过，不做重复请求 */
    async ensure(symbols, fromDay, toDay) {
      const yesterday = addDays(toDay, -1);
      const out = {};
      for (const symbol of symbols) {
        const cov = coverage.get(symbol);
        const covered = cov.minDay && cov.minDay <= fromDay && cov.maxDay && cov.maxDay >= yesterday;
        if (covered) {
          out[symbol] = { status: 'cached' };
          continue;
        }
        const r = await fetchSymbolHistory(symbol, fromDay, toDay);
        out[symbol] = r.ok ? { status: 'fetched', points: r.points } : { status: 'failed', reason: r.reason };
      }
      return out;
    },

    /**
     * 按天重放交易，算出每天的净资产与投入本金。
     * 收益率与回撤用时间加权（TWR）口径，剔除入金/出金造成的净值跳变。
     */
    series({ transactions, settings, fromDay, toDay }) {
      const initial = Number(settings.initial_capital_usdt ?? 0);
      const sorted = sortTransactions(transactions);
      const days = enumerateDays(fromDay, toDay);

      const symbols = [...new Set(sorted.filter((t) => t.symbol).map((t) => t.symbol))];
      const priceMap = new Map();
      for (const s of symbols) {
        const m = new Map();
        // 多取 30 天，供区间起点的前向填充
        for (const r of rangePrices.all(s, addDays(fromDay, -30), toDay)) m.set(r.day, r.price_usdt);
        priceMap.set(s, m);
      }

      let cash = initial;
      let realized = 0;
      let invested = initial;
      const pos = new Map();
      let idx = 0;

      const points = [];
      let index = 1;
      let prevNetWorth = null;
      let peak = 1;
      let peakDay = fromDay;
      let maxDrawdown = 0;
      let ddFrom = null;
      let ddTo = null;

      for (const day of days) {
        const endTs = `${day}T23:59:59.999`;
        let dayCashflow = 0;

        while (idx < sorted.length && sorted[idx].ts <= endTs) {
          const t = sorted[idx++];
          if (t.type === 'DEPOSIT') {
            cash += t.total_usdt; invested += t.total_usdt; dayCashflow += t.total_usdt;
          } else if (t.type === 'WITHDRAW') {
            cash -= t.total_usdt; invested -= t.total_usdt; dayCashflow -= t.total_usdt;
          } else {
            const p = pos.get(t.symbol) ?? { quantity: 0, cost_basis: 0 };
            if (t.type === 'BUY') {
              cash -= t.total_usdt;
              p.quantity += t.quantity;
              p.cost_basis += t.total_usdt;
            } else {
              const avg = p.quantity > EPS ? p.cost_basis / p.quantity : 0;
              const costOut = avg * t.quantity;
              realized += t.total_usdt - costOut;
              cash += t.total_usdt;
              p.cost_basis -= costOut;
              p.quantity -= t.quantity;
            }
            pos.set(t.symbol, p);
          }
        }

        let marketValue = 0;
        let costBasis = 0;
        let estimated = false;
        for (const [symbol, p] of pos) {
          if (p.quantity <= EPS) continue;
          let price = priceMap.get(symbol)?.get(day);
          if (price == null) price = latestBefore.get(symbol, day)?.price_usdt;
          if (price == null) {
            // 取不到历史价时用成本价兜底，保证曲线连续（该点标记为估算）
            price = p.cost_basis / p.quantity;
            estimated = true;
          }
          marketValue += p.quantity * price;
          costBasis += p.cost_basis;
        }

        const netWorth = cash + marketValue;
        if (prevNetWorth != null && prevNetWorth > EPS) {
          // 扣掉当天外部现金流，剩下的才是投资本身赚赔的
          index *= 1 + (netWorth - dayCashflow - prevNetWorth) / prevNetWorth;
        }

        if (index > peak) { peak = index; peakDay = day; }
        const drawdown = peak > EPS ? (peak - index) / peak : 0;
        if (drawdown > maxDrawdown) { maxDrawdown = drawdown; ddFrom = peakDay; ddTo = day; }
        prevNetWorth = netWorth;

        points.push({
          day,
          net_worth: netWorth,
          invested,
          market_value: marketValue,
          cash,
          cost_basis: costBasis,
          realized,
          pnl: netWorth - invested,
          twr_index: index,
          drawdown,
          estimated,
        });
      }

      return { points, max_drawdown: maxDrawdown, drawdown_from: ddFrom, drawdown_to: ddTo };
    },
  };
}
