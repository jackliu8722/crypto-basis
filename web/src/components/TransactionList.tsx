import { useState } from 'react';
import { api, type Transaction } from '../api';
import { fmtUsdt, fmtQty, fmtPrice, fmtTime } from '../format';

const TYPE_LABEL: Record<string, string> = { BUY: '买入', SELL: '卖出', DEPOSIT: '入金', WITHDRAW: '出金' };

export default function TransactionList({
  transactions,
  onChanged,
}: {
  transactions: Transaction[];
  onChanged: () => void;
}) {
  const [filter, setFilter] = useState('');
  const [undone, setUndone] = useState<Transaction | null>(null);

  const rows = [...transactions].filter((t) => !filter || t.symbol === filter).reverse();

  async function remove(t: Transaction) {
    await api.deleteTransaction(t.id);
    setUndone(t);
    onChanged();
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
        <input
          placeholder="按币种筛选"
          value={filter}
          onChange={(e) => setFilter(e.target.value.toUpperCase())}
        />
      </header>
      {undone && (
        <p className="warn">
          已删除一条 {TYPE_LABEL[undone.type]} 记录 <button onClick={undo}>撤销</button>
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
            <tr key={t.id}>
              <td>{fmtTime(t.ts)}</td>
              <td className={t.type === 'BUY' ? 'down' : t.type === 'SELL' ? 'up' : ''}>{TYPE_LABEL[t.type]}</td>
              <td>{t.symbol ?? '—'}</td>
              <td className="num">{fmtQty(t.quantity)}</td>
              <td className="num">{t.quantity ? fmtPrice(t.total_usdt / t.quantity) : '—'}</td>
              <td className="num">{fmtUsdt(t.total_usdt)}</td>
              <td>{t.note ?? ''}</td>
              <td>
                <button onClick={() => remove(t)}>删除</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
