import { useRef, useState } from 'react';
import type { HistoryPoint } from '../api';
import { fmtUsdt, fmtCompact } from '../format';

const W = 760;
const H = 240;
const PAD = { l: 66, r: 16, t: 16, b: 28 };
const IW = W - PAD.l - PAD.r;
const IH = H - PAD.t - PAD.b;

export default function NetWorthChart({ points }: { points: HistoryPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  if (points.length === 0) return <p className="muted">没有数据</p>;

  const values = points.map((p) => p.net_worth);
  const investValues = points.map((p) => p.invested);
  let min = Math.min(...values, ...investValues);
  let max = Math.max(...values, ...investValues);
  if (max - min < 1e-8) {
    min -= 1;
    max += 1;
  } else {
    const padY = (max - min) * 0.08;
    min -= padY;
    max += padY;
  }

  const x = (i: number) => PAD.l + (points.length === 1 ? IW / 2 : (i / (points.length - 1)) * IW);
  const y = (v: number) => PAD.t + IH - ((v - min) / (max - min)) * IH;

  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.net_worth).toFixed(1)}`).join(' ');
  const area = `${line} L${x(points.length - 1).toFixed(1)},${(PAD.t + IH).toFixed(1)} L${x(0).toFixed(1)},${(PAD.t + IH).toFixed(1)} Z`;
  const investLine = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.invested).toFixed(1)}`).join(' ');

  // 最大回撤区间：在图上用红色区块标出
  let ddBand: { x0: number; x1: number } | null = null;
  const maxDdPoint = points.reduce((best, p) => (p.drawdown > best.drawdown ? p : best), points[0]);
  if (maxDdPoint.drawdown > 1e-8) {
    let peakIdx = 0;
    for (let i = 0; i < points.length; i++) {
      if (points[i].twr_index >= points[peakIdx].twr_index) peakIdx = i;
      if (points[i].day === maxDdPoint.day) break;
    }
    const endIdx = points.findIndex((p) => p.day === maxDdPoint.day);
    if (endIdx > peakIdx) ddBand = { x0: x(peakIdx), x1: x(endIdx) };
  }

  const gridValues = [0, 0.25, 0.5, 0.75, 1].map((r) => min + (max - min) * r);

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || points.length === 0) return;
    const ratio = (e.clientX - rect.left) / rect.width;
    const px = ratio * W;
    const idx = Math.round(((px - PAD.l) / IW) * (points.length - 1));
    setHover(Math.max(0, Math.min(points.length - 1, idx)));
  }

  const hp = hover != null ? points[hover] : null;

  return (
    <div className="chart-wrap">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="chart"
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id="nwFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2f6fed" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#2f6fed" stopOpacity="0" />
          </linearGradient>
        </defs>

        {gridValues.map((v, i) => (
          <g key={i}>
            <line x1={PAD.l} y1={y(v)} x2={W - PAD.r} y2={y(v)} stroke="#2b3139" strokeWidth="1" />
            <text x={PAD.l - 8} y={y(v) + 4} textAnchor="end" className="axis">
              {fmtCompact(v)}
            </text>
          </g>
        ))}

        {ddBand && (
          <rect
            x={ddBand.x0}
            y={PAD.t}
            width={Math.max(ddBand.x1 - ddBand.x0, 1)}
            height={IH}
            fill="rgba(246, 70, 93, 0.12)"
          />
        )}

        <path d={area} fill="url(#nwFill)" />
        <path d={investLine} fill="none" stroke="#848e9c" strokeWidth="1.5" strokeDasharray="5 4" />
        <path d={line} fill="none" stroke="#2f6fed" strokeWidth="2.2" strokeLinejoin="round" />

        <text x={PAD.l} y={H - 8} className="axis">
          {points[0].day.slice(5)}
        </text>
        <text x={W - PAD.r} y={H - 8} textAnchor="end" className="axis">
          {points[points.length - 1].day.slice(5)}
        </text>

        {hp && (
          <g>
            <line x1={x(hover!)} y1={PAD.t} x2={x(hover!)} y2={PAD.t + IH} stroke="#6b7684" strokeWidth="1" />
            <circle cx={x(hover!)} cy={y(hp.net_worth)} r="3.5" fill="#2f6fed" stroke="#fff" strokeWidth="1.5" />
          </g>
        )}
      </svg>

      {hp && (
        <div
          className="chart-tip"
          style={{ left: `${(x(hover!) / W) * 100}%`, top: 8 }}
        >
          <strong>{hp.day}</strong>
          <span>总资产 {fmtUsdt(hp.net_worth)}</span>
          <span>投入本金 {fmtUsdt(hp.invested)}</span>
          <span className={hp.pnl >= 0 ? 'up' : 'down'}>收益 {fmtUsdt(hp.pnl)}</span>
          <span>回撤 {(hp.drawdown * 100).toFixed(2)}%</span>
          {hp.estimated && <span className="stale">（该日缺价格，按成本估算）</span>}
        </div>
      )}

      <div className="chart-legend">
        <span><i className="sw sw-net" /> 总资产</span>
        <span><i className="sw sw-invest" /> 投入本金</span>
        <span><i className="sw sw-dd" /> 最大回撤区间</span>
      </div>
    </div>
  );
}
