import { useCallback, useEffect, useState } from 'react';
import { api, type State } from './api';
import SummaryCards from './components/SummaryCards';
import PositionsTable from './components/PositionsTable';
import TransactionForm from './components/TransactionForm';
import TransactionList from './components/TransactionList';
import SettingsPanel from './components/SettingsPanel';

export default function App() {
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState('');
  const [showClosed, setShowClosed] = useState(false);

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
      <h1>持仓成本记录器</h1>
      {error && (
        <p className="warn clickable" onClick={() => setError('')}>
          {error}（点击关闭）
        </p>
      )}
      <SummaryCards state={state} />
      <TransactionForm onDone={reload} onError={setError} />
      <PositionsTable state={state} showClosed={showClosed} onToggleClosed={setShowClosed} />
      <TransactionList transactions={state.transactions} onChanged={reload} />
      <SettingsPanel state={state} onChanged={reload} />
    </main>
  );
}
