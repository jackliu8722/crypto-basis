import { useState } from 'react';
import { api } from '../api';
import { fmtPrice } from '../format';

type Type = 'BUY' | 'SELL' | 'DEPOSIT' | 'WITHDRAW';

export default function TransactionForm({ onDone, onError }: { onDone: () => void; onError: (m: string) => void }) {
  const [type, setType] = useState<Type>('BUY');
  const [symbol, setSymbol] = useState('');
  const [quantity, setQuantity] = useState('');
  const [total, setTotal] = useState('');
  const [note, setNote] = useState('');
  const [ts, setTs] = useState('');

  const isTrade = type === 'BUY' || type === 'SELL';
  const qtyNum = Number(quantity);
  const totalNum = Number(total);
  const unitPrice = isTrade && qtyNum > 0 && totalNum > 0 ? totalNum / qtyNum : null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.addTransaction({
        type,
        ...(isTrade ? { symbol, quantity: qtyNum } : {}),
        total_usdt: totalNum,
        note: note || undefined,
        ts: ts ? new Date(ts).toISOString() : undefined,
      });
      setSymbol('');
      setQuantity('');
      setTotal('');
      setNote('');
      setTs('');
      onDone();
    } catch (err) {
      onError((err as Error).message);
    }
  }

  return (
    <form onSubmit={submit} className="form">
      <select value={type} onChange={(e) => setType(e.target.value as Type)}>
        <option value="BUY">买入</option>
        <option value="SELL">卖出</option>
        <option value="DEPOSIT">入金</option>
        <option value="WITHDRAW">出金</option>
      </select>
      {isTrade && (
        <>
          <input placeholder="币种 如 BTC" value={symbol} onChange={(e) => setSymbol(e.target.value)} required />
          <input
            placeholder="数量"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            inputMode="decimal"
            required
          />
        </>
      )}
      <input placeholder="USDT 金额" value={total} onChange={(e) => setTotal(e.target.value)} inputMode="decimal" required />
      <input type="datetime-local" value={ts} onChange={(e) => setTs(e.target.value)} />
      <input placeholder="备注（可选）" value={note} onChange={(e) => setNote(e.target.value)} />
      <button type="submit">记录</button>
      {unitPrice != null && <span className="muted">单价 {fmtPrice(unitPrice)} USDT</span>}
    </form>
  );
}
