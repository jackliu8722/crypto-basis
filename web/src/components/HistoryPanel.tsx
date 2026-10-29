import { useCallback, useEffect, useState } from 'react';
import { api, type HistoryResponse } from '../api';
import { fmtUsdt, fmtPct, fmtSigned, MASK } from '../format';
import { usePrivacy } from '../privacy';
import NetWorthChart from './NetWorthChart';

type Preset = '7' | '30' | 'all' | 'custom';

const PRESETS: { value: Preset; label: string }[] = [
  { value: '7', label: '近 7 天' },
  { value: '30', label: '近 30 天' },
  { value: 'all', label: '全部' },
  { value: 'custom', label: '自定义' },
];

function localDay(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function shiftDays(d: Date, n: number) {
  const c = new Date(d);
  c.setDate(c.getDate() + n);
  return c;
}

export default function HistoryPanel() {
  const hidden = usePrivacy();
  const [preset, setPreset] = useState<Preset>('30');
  const [from, setFrom] = useState(localDay(shiftDays(new Date(), -29)));
  const [to, setTo] = useState(localDay(new Date()));
  const [data, setData] = useState<HistoryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (params: { days?: string; from?: string; to?: string }) => {
    setLoading(true);
    setError('');
    try {
      setData(await api.getHistory(params));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (preset !== 'custom') load({ days: preset });
  }, [preset, load]);

  const points = data?.points ?? [];
  const first = points[0];
  const last = points[points.length - 1];
  // 区间收益 = 期末收益 - 期初收益，天然剔除了这段时间的入金
  const rangePnl = first && last ? last.pnl - first.pnl : null;
  const rangeRoi = first && last && first.twr_index > 0 ? last.twr_index / first.twr_index - 1 : null;

  return (
    <section>
      <header className="section-head">
        <h2>收益走势</h2>
        <div className="type-switch">
          {PRESETS.map((p) => (
            <button
              key={p.value}
              type="button"
              className={preset === p.value ? 'active' : ''}
              onClick={() => setPreset(p.value)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </header>

      {preset === 'custom' && (
        <div className="form range-row">
          <label className="field">
            <span>开始</span>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="field">
            <span>结束</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
          <button className="primary" onClick={() => load({ from, to })} disabled={!from || !to}>
            应用
          </button>
        </div>
      )}

      {error && <p className="warn">{error}</p>}

      {data && points.length > 0 && (
        <div className="range-stats">
          <div className="stat">
            <span>区间收益</span>
            <strong className={rangePnl != null && rangePnl >= 0 ? 'up' : 'down'}>
              {hidden ? MASK : fmtSigned(rangePnl)}
            </strong>
          </div>
          <div className="stat">
            <span>区间收益率</span>
            <strong className={rangeRoi != null && rangeRoi >= 0 ? 'up' : 'down'}>{fmtPct(rangeRoi)}</strong>
          </div>
          <div className="stat">
            <span>最大回撤</span>
            <strong className="down">{fmtPct(data.max_drawdown)}</strong>
          </div>
          <div className="stat">
            <span>当前回撤</span>
            <strong>{fmtPct(last?.drawdown ?? 0)}</strong>
          </div>
          <div className="stat">
            <span>期末总资产</span>
            <strong>{hidden ? MASK : fmtUsdt(last?.net_worth)}</strong>
          </div>
        </div>
      )}

      {loading && <p className="muted">加载中…（首次查看需要抓取历史价格）</p>}

      {!loading && data && points.length === 0 && (
        <p className="muted">这个区间没有数据，换一个时间范围试试。</p>
      )}

      {!loading && data && points.length === 1 && (
        <p className="muted">这个区间只有 1 个数据点，画不出走势。选长一点的时间范围。</p>
      )}

      {!loading && data && points.length > 1 && (
        <>
          <NetWorthChart points={points} />
          {data.max_drawdown > 0 && data.drawdown_from && (
            <p className="muted">
              最大回撤发生在 {data.drawdown_from} → {data.drawdown_to}，
              从高点回落 {(data.max_drawdown * 100).toFixed(2)}%
            </p>
          )}
        </>
      )}
    </section>
  );
}
