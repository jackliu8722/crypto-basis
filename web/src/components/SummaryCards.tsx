import type { State } from '../api';
import { fmtUsdt, fmtPct, fmtSigned, MASK } from '../format';
import { usePrivacy } from '../privacy';

export default function SummaryCards({ state }: { state: State }) {
  const hidden = usePrivacy();
  const t = state.totals;
  // 金额类一律打码；百分比是相对量，保留
  const cards = [
    { label: '净资产', value: hidden ? MASK : fmtUsdt(t.net_worth), tone: '' },
    { label: '总收益率', value: fmtPct(t.roi_pct), tone: t.roi_pct == null ? '' : t.roi_pct >= 0 ? 'up' : 'down' },
    { label: 'USDT 余额', value: hidden ? MASK : fmtUsdt(state.cash_usdt), tone: state.cash_usdt < 0 ? 'down' : '' },
    { label: '持仓市值', value: hidden ? MASK : fmtUsdt(t.market_value_total), tone: '' },
    {
      // 回本口径下这个数就是全部收益（卖出赚的已经并进来了）
      label: '累计盈亏',
      value: hidden ? MASK : fmtSigned(t.unrealized_pnl_total),
      tone: (t.unrealized_pnl_total ?? 0) >= 0 ? 'up' : 'down',
    },
    {
      // 纯参考值，不参与收益计算
      label: '累计卖出 USDT',
      value: hidden ? MASK : fmtUsdt(t.total_sold_usdt),
      tone: '',
    },
    { label: '总投入本金', value: hidden ? MASK : fmtUsdt(t.invested_capital), tone: '' },
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
