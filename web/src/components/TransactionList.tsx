import { useState } from 'react';
import { api, type Transaction } from '../api';
import { fmtUsdt, fmtQty, fmtPrice, fmtTime } from '../format';

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
    if (t.symbol) parts.push(`${fmtQty(t.quantity)} ${t.symbol}`);
    parts.push(`${fmtUsdt(t.total_usdt)} USDT`);
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
        <label className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <span>按币种筛选</span>
          <input
            style={{ width: 110 }}
            placeholder="BTC"
            value={filter}
            onChange={(e) => setFilter(e.target.value.toUpperCase())}
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
              <td className="num">{fmtQty(t.quantity)}</td>
              <td className="num">{t.quantity ? fmtPrice(t.total_usdt / t.quantity) : '—'}</td>
              <td className="num">{fmtUsdt(t.total_usdt)}</td>
              <td>{t.note ?? ''}</td>
              <td>
                {confirmingId === t.id ? (
                  <span className="confirm">
                    <span className="confirm-text">删除「{describe(t)}」？</span>
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
    </section>
  );
}
