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
};
