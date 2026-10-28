import { useCallback, useEffect, useState } from 'react';
import { api, type State } from './api';
import Logo from './components/Logo';
import SummaryCards from './components/SummaryCards';
import PositionsTable from './components/PositionsTable';
import HistoryPanel from './components/HistoryPanel';
import TransactionModal from './components/TransactionModal';
import TransactionList from './components/TransactionList';
import SettingsPanel from './components/SettingsPanel';

export default function App() {
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState('');
  const [showClosed, setShowClosed] = useState(false);
  const [adding, setAdding] = useState(false);

  const reload = useCallback(async () => {
    try {
      setState(await api.getState());
      setError('');
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  if (!state) return <main><p>{error || '加载中…'}</p></main>;

  return (
    <main>
      <div className="page-head">
        <div className="brand">
          <Logo />
          <div className="brand-text">
            <h1>成本簿</h1>
            <span className="muted">USDT 持仓成本与收益</span>
          </div>
        </div>
        <button className="primary" onClick={() => setAdding(true)}>
          + 记一笔
        </button>
      </div>

      {error && (
        <p className="warn clickable" onClick={() => setError('')}>
          {error}（点击关闭）
        </p>
      )}

      <SummaryCards state={state} />
      <HistoryPanel />
      <PositionsTable state={state} showClosed={showClosed} onToggleClosed={setShowClosed} />
      <TransactionList transactions={state.transactions} onChanged={reload} />
      <SettingsPanel state={state} onChanged={reload} />

      <TransactionModal open={adding} onClose={() => setAdding(false)} onDone={reload} />
    </main>
  );
}
