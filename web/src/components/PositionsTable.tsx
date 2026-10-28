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

export default function PositionsTable({
  state,
  showClosed,
  onToggleClosed,
}: {
  state: State;
  showClosed: boolean;
  onToggleClosed: (v: boolean) => void;
}) {
  const rows = state.positions
    .filter((p) => showClosed || p.quantity > 1e-8)
    .sort((a, b) => (b.market_value ?? 0) - (a.market_value ?? 0));

  const cashWeight = state.totals.net_worth > 0 ? state.cash_usdt / state.totals.net_worth : null;

  return (
    <section>
      <header className="section-head">
        <h2>持仓</h2>
        <label>
          <input type="checkbox" checked={showClosed} onChange={(e) => onToggleClosed(e.target.checked)} />
          显示已清仓
        </label>
      </header>
      {rows.length === 0 ? (
        <p className="muted">还没有持仓，先在上方录入一笔买入。</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>币种</th>
                <th>数量</th>
                <th>均价</th>
                <th>现价</th>
                <th>市值</th>
                <th>浮盈</th>
                <th>收益率</th>
                <th>占比</th>
              </tr>
            </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.symbol} className={p.inconsistent ? 'row-bad' : ''}>
                <td>
                  {p.symbol}
                  {p.inconsistent && <span className="warn-inline"> 数据不一致</span>}
                </td>
                <td className="num">{fmtQty(p.quantity)}</td>
                <td className="num">{fmtPrice(p.avg_cost)}</td>
                <PriceCell p={p} fetchedAt={state.prices[p.symbol]?.fetched_at ?? null} />
                <td className="num">{fmtUsdt(p.market_value)}</td>
                <td className={`num ${(p.unrealized_pnl ?? 0) >= 0 ? 'up' : 'down'}`}>{fmtSigned(p.unrealized_pnl)}</td>
                <td className={`num ${(p.unrealized_pnl_pct ?? 0) >= 0 ? 'up' : 'down'}`}>
                  {fmtPct(p.unrealized_pnl_pct)}
                </td>
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
        </div>
      )}
    </section>
  );
}
