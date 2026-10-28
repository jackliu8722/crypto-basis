import type { State } from '../api';
import { fmtUsdt, fmtPct, fmtSigned } from '../format';

export default function SummaryCards({ state }: { state: State }) {
  const t = state.totals;
  const cards = [
    { label: '净资产', value: fmtUsdt(t.net_worth), tone: '' },
    { label: '总收益率', value: fmtPct(t.roi_pct), tone: t.roi_pct == null ? '' : t.roi_pct >= 0 ? 'up' : 'down' },
    { label: 'USDT 余额', value: fmtUsdt(state.cash_usdt), tone: state.cash_usdt < 0 ? 'down' : '' },
    { label: '持仓市值', value: fmtUsdt(t.market_value_total), tone: '' },
    { label: '浮动盈亏', value: fmtSigned(t.unrealized_pnl_total), tone: (t.unrealized_pnl_total ?? 0) >= 0 ? 'up' : 'down' },
    { label: '已实现盈亏', value: fmtSigned(t.realized_pnl_total), tone: t.realized_pnl_total >= 0 ? 'up' : 'down' },
    { label: '总投入本金', value: fmtUsdt(t.invested_capital), tone: '' },
  ];

  return (
    <section className="cards">
      {cards.map((c) => (
        <div className="card" key={c.label}>
          <span className="card-label">{c.label}</span>
          <strong className={`card-value ${c.tone}`}>{c.value}</strong>
        </div>
      ))}
      {state.warnings.map((w) => (
        <p className="warn" key={w}>
          {w}
        </p>
      ))}
    </section>
  );
}
