import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { fmtPrice } from '../format';

type Type = 'BUY' | 'SELL' | 'DEPOSIT' | 'WITHDRAW';

const TYPES: { value: Type; label: string }[] = [
  { value: 'BUY', label: '买入' },
  { value: 'SELL', label: '卖出' },
  { value: 'DEPOSIT', label: '入金' },
  { value: 'WITHDRAW', label: '出金' },
];

export default function TransactionModal({
  open,
  onClose,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [type, setType] = useState<Type>('BUY');
  const [symbol, setSymbol] = useState('');
  const [quantity, setQuantity] = useState('');
  const [total, setTotal] = useState('');
  const [ts, setTs] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const symbolRef = useRef<HTMLInputElement>(null);
  const isTrade = type === 'BUY' || type === 'SELL';
  const qtyNum = Number(quantity);
  const totalNum = Number(total);
  const unitPrice = isTrade && qtyNum > 0 && totalNum > 0 ? totalNum / qtyNum : null;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    const t = setTimeout(() => symbolRef.current?.focus(), 40);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      clearTimeout(t);
    };
  }, [open, onClose]);

  function reset() {
    setSymbol('');
    setQuantity('');
    setTotal('');
    setNote('');
    setTs('');
    setError('');
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.addTransaction({
        type,
        ...(isTrade ? { symbol, quantity: qtyNum } : {}),
        total_usdt: totalNum,
        note: note || undefined,
        ts: ts ? new Date(ts).toISOString() : undefined,
      });
      reset();
      onDone();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="记录一笔交易"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="modal-head">
          <h2>记录一笔交易</h2>
          <button className="link" onClick={onClose} aria-label="关闭">
            ✕
          </button>
        </header>

        <form onSubmit={submit}>
          <div className="modal-body">
            <div className="modal-row">
              <span className="modal-label">类型</span>
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
                <label className="modal-row">
                  <span className="modal-label">币种</span>
                  <input
                    ref={symbolRef}
                    placeholder="BTC"
                    value={symbol}
                    onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                    autoCapitalize="characters"
                    spellCheck={false}
                    required
                  />
                </label>

                <label className="modal-row">
                  <span className="modal-label">数量</span>
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

            <label className="modal-row">
              <span className="modal-label">USDT 金额</span>
              <input
                placeholder="0.00"
                value={total}
                onChange={(e) => setTotal(e.target.value)}
                inputMode="decimal"
                required
              />
            </label>

            {unitPrice != null && (
              <div className="modal-row">
                <span className="modal-label">单价</span>
                <span className="modal-static">
                  {fmtPrice(unitPrice)} USDT <span className="muted">（按数量与金额自动算出）</span>
                </span>
              </div>
            )}

            <label className="modal-row">
              <span className="modal-label">时间</span>
              <input type="datetime-local" value={ts} onChange={(e) => setTs(e.target.value)} />
            </label>

            <label className="modal-row modal-row-top">
              <span className="modal-label">备注</span>
              <textarea
                rows={2}
                placeholder="可选，比如为什么买 / 为什么卖"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </label>

            {error && <p className="warn modal-error">{error}</p>}
          </div>

          <footer className="modal-foot">
            <button type="button" onClick={onClose}>
              取消
            </button>
            <button type="submit" className="primary" disabled={busy}>
              {busy ? '保存中…' : '保存'}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
