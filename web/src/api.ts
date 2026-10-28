export type Transaction = {
  id: number;
  ts: string;
  type: 'BUY' | 'SELL' | 'DEPOSIT' | 'WITHDRAW';
  symbol: string | null;
  quantity: number | null;
  total_usdt: number;
  note: string | null;
};

export type Position = {
  symbol: string;
  quantity: number;
  avg_cost: number;
  cost_basis: number;
  current_price: number | null;
  market_value: number | null;
  unrealized_pnl: number | null;
  unrealized_pnl_pct: number | null;
  price_stale: boolean;
  inconsistent: boolean;
  weight: number | null;
};

export type State = {
  settings: { initial_capital_usdt: number; price_ttl_seconds: number; proxy_url: string | null };
  transactions: Transaction[];
  cash_usdt: number;
  positions: Position[];
  totals: {
    invested_capital: number;
    market_value_total: number;
    cost_basis_total: number;
    unrealized_pnl_total: number | null;
    realized_pnl_total: number;
    net_worth: number;
    roi_pct: number | null;
  };
  warnings: string[];
  prices: Record<string, { price: number | null; stale: boolean; fetched_at: string | null; source: string }>;
};

export type HistoryPoint = {
  day: string;
  net_worth: number;
  invested: number;
  market_value: number;
  cash: number;
  cost_basis: number;
  realized: number;
  pnl: number;
  twr_index: number;
  drawdown: number;
  estimated: boolean;
};

export type HistoryResponse = {
  from: string;
  to: string;
  points: HistoryPoint[];
  max_drawdown: number;
  drawdown_from: string | null;
  drawdown_to: string | null;
  coverage: Record<string, { status: string; points?: number; reason?: string }>;
};

async function req<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `请求失败 ${res.status}`);
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

const json = (body: unknown) => ({
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

export const api = {
  getState: () => req<State>('/api/state'),
  addTransaction: (body: Record<string, unknown>) =>
    req<Transaction>('/api/transactions', { method: 'POST', ...json(body) }),
  deleteTransaction: (id: number) => req(`/api/transactions/${id}`, { method: 'DELETE' }),
  restoreTransaction: (id: number) => req(`/api/transactions/${id}/restore`, { method: 'POST' }),
  refreshPrices: () => req('/api/prices/refresh', { method: 'POST' }),
  setPrice: (symbol: string, price: number) => req(`/api/prices/${symbol}`, { method: 'PUT', ...json({ price }) }),
  updateSettings: (body: Record<string, unknown>) => req('/api/settings', { method: 'PUT', ...json(body) }),
  getHistory: (params: { days?: string; from?: string; to?: string }) => {
    const q = new URLSearchParams();
    if (params.days) q.set('days', params.days);
    if (params.from) q.set('from', params.from);
    if (params.to) q.set('to', params.to);
    return req<HistoryResponse>(`/api/history?${q.toString()}`);
  },
};
