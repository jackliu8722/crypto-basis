import { useState } from 'react';
import { api } from '../api';
import { fmtPrice } from '../format';

type Type = 'BUY' | 'SELL' | 'DEPOSIT' | 'WITHDRAW';

const TYPES: { value: Type; label: string }[] = [
  { value: 'BUY', label: '买入' },
  { value: 'SELL', label: '卖出' },
  { value: 'DEPOSIT', label: '入金' },
  { value: 'WITHDRAW', label: '出金' },
];

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
      <div className="field">
        <span>类型</span>
        <div className="type-switch">
          {TYPES.map((t) => (
            <button
              key={t.value}
              type="button"
              className={type === t.value ? 'active' : ''}
              onClick={() => setType(t.value)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {isTrade && (
        <>
          <label className="field field-symbol">
            <span>币种</span>
            <input
              placeholder="BTC"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              autoCapitalize="characters"
              spellCheck={false}
              required
            />
          </label>
          <label className="field field-qty">
            <span>数量</span>
            <input
              placeholder="0.00"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              inputMode="decimal"
              required
            />
          </label>
        </>
      )}

      <label className="field field-money">
        <span>USDT 金额</span>
        <input
          placeholder="0.00"
          value={total}
          onChange={(e) => setTotal(e.target.value)}
          inputMode="decimal"
          required
        />
      </label>

      <label className="field field-time">
        <span>时间（默认现在）</span>
        <input type="datetime-local" value={ts} onChange={(e) => setTs(e.target.value)} />
      </label>

      <label className="field field-note">
        <span>备注</span>
        <input placeholder="可选" value={note} onChange={(e) => setNote(e.target.value)} />
      </label>

      <button type="submit" className="primary">
        记录
      </button>

      {unitPrice != null && (
        <span className="muted unit-price">单价 {fmtPrice(unitPrice)} USDT</span>
      )}
    </form>
  );
}
