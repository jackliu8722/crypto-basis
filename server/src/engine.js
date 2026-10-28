const EPS = 1e-8;

export function sortTransactions(txns) {
  return [...txns].sort((a, b) => (a.ts === b.ts ? a.id - b.id : a.ts < b.ts ? -1 : 1));
}

export function isBefore(t, ts, id) {
  return t.ts < ts || (t.ts === ts && t.id < id);
}

/** 某笔交易发生前，该币的持仓量（用于卖出超额校验） */
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

/**
 * 从交易流水重放全部状态。纯函数：不读库、不发网络请求。
 * @param {{transactions: Array, settings: {initial_capital_usdt: number}, prices: Object}} input
 */
export function computeState({ transactions = [], settings = {}, prices = {} } = {}) {
  const initialCapital = Number(settings.initial_capital_usdt ?? 0);
  let cash = initialCapital;
  let realized = 0;
  let deposits = 0;
  let withdraws = 0;
  const pos = new Map();

  const ensure = (symbol) => {
    if (!pos.has(symbol)) pos.set(symbol, { symbol, quantity: 0, cost_basis: 0, inconsistent: false });
    return pos.get(symbol);
  };

  for (const t of sortTransactions(transactions)) {
    if (t.type === 'DEPOSIT') { cash += t.total_usdt; deposits += t.total_usdt; continue; }
    if (t.type === 'WITHDRAW') { cash -= t.total_usdt; withdraws += t.total_usdt; continue; }

    const p = ensure(t.symbol);
    if (t.type === 'BUY') {
      cash -= t.total_usdt;
      p.quantity += t.quantity;
      p.cost_basis += t.total_usdt;
    } else if (t.type === 'SELL') {
      const avg = p.quantity > EPS ? p.cost_basis / p.quantity : 0;
      const costOut = avg * t.quantity;
      realized += t.total_usdt - costOut;
      cash += t.total_usdt;
      p.cost_basis -= costOut;
      p.quantity -= t.quantity;
      if (p.quantity < -EPS) p.inconsistent = true;
    }
    if (Math.abs(p.quantity) <= EPS) { p.quantity = 0; p.cost_basis = 0; }
    pos.set(t.symbol, p);
  }

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
      weight: null,
    };
  });

  const marketValueTotal = positions.reduce((acc, p) => acc + (p.market_value ?? 0), 0);
  const costBasisTotal = positions.reduce((acc, p) => acc + p.cost_basis, 0);
  const unrealizedTotal = positions.every((p) => p.market_value === null)
    ? null
    : positions.reduce((acc, p) => acc + (p.unrealized_pnl ?? 0), 0);
  const investedCapital = initialCapital + deposits - withdraws;
  const netWorth = cash + marketValueTotal;

  for (const p of positions) {
    p.weight = netWorth > EPS ? (p.market_value ?? 0) / netWorth : null;
  }

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
}
