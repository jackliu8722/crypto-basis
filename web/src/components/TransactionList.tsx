import { useState } from 'react';
import { api, type Transaction } from '../api';
import { fmtUsdt, fmtQty, fmtPrice, fmtTime, MASK } from '../format';
import { usePrivacy } from '../privacy';

const TYPE_LABEL: Record<string, string> = { BUY: '买入', SELL: '卖出', DEPOSIT: '入金', WITHDRAW: '出金' };
const TYPE_CLASS: Record<string, string> = {
  BUY: 'badge badge-buy',
  SELL: 'badge badge-sell',
  DEPOSIT: 'badge badge-cash',
  WITHDRAW: 'badge badge-cash',
};

export default function TransactionList({
  transactions,
  onChanged,
}: {
  transactions: Transaction[];
  onChanged: () => void;
}) {
  const hidden = usePrivacy();
  const [filter, setFilter] = useState('');
  const [undone, setUndone] = useState<Transaction | null>(null);
  const [confirmingId, setConfirmingId] = useState<number | null>(null);

  const rows = [...transactions].filter((t) => !filter || t.symbol === filter).reverse();

  async function remove(t: Transaction) {
    await api.deleteTransaction(t.id);
    setConfirmingId(null);
    setUndone(t);
    onChanged();
  }

  function describe(t: Transaction) {
    const parts = [TYPE_LABEL[t.type]];
    if (t.symbol) parts.push(hidden ? t.symbol : `${fmtQty(t.quantity)} ${t.symbol}`);
    if (!hidden) parts.push(`${fmtUsdt(t.total_usdt)} USDT`);
    return parts.join(' · ');
  }

  async function undo() {
    if (!undone) return;
    await api.restoreTransaction(undone.id);
    setUndone(null);
    onChanged();
  }

  return (
    <section>
      <header className="section-head">
        <h2>流水</h2>
        <label className="filter-box">
          <span>按币种筛选</span>
          <input
            placeholder="BTC"
            value={filter}
            onChange={(e) => setFilter(e.target.value.toUpperCase())}
            autoCapitalize="characters"
            spellCheck={false}
          />
        </label>
      </header>
      {undone && (
        <p className="warn">
          已删除「{describe(undone)}」
          <button className="link" onClick={undo}>
            撤销
          </button>
        </p>
      )}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>时间</th>
              <th>类型</th>
              <th>币种</th>
              <th>数量</th>
              <th>单价</th>
              <th>USDT 金额</th>
              <th>备注</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id} className={confirmingId === t.id ? 'row-confirm' : ''}>
                <td>{fmtTime(t.ts)}</td>
                <td>
                  <span className={TYPE_CLASS[t.type]}>{TYPE_LABEL[t.type]}</span>
                </td>
                <td>{t.symbol ?? '—'}</td>
                <td className="num">{hidden ? MASK : fmtQty(t.quantity)}</td>
                {/* 成交价是公开市场价，留着；数量和金额打码 */}
                <td className="num">{t.quantity ? fmtPrice(t.total_usdt / t.quantity) : '—'}</td>
                <td className="num">{hidden ? MASK : fmtUsdt(t.total_usdt)}</td>
                <td>{t.note ?? ''}</td>
                <td>
                  {confirmingId === t.id ? (
                    <span className="confirm" title={describe(t)}>
                      <span className="confirm-text">确认删除？</span>
                      <button className="danger" onClick={() => remove(t)}>
                        确认
                      </button>
                      <button onClick={() => setConfirmingId(null)}>取消</button>
                    </span>
                  ) : (
                    <button className="danger" onClick={() => setConfirmingId(t.id)}>
                      删除
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
