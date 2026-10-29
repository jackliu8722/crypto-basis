import { useCallback, useEffect, useState } from 'react';
import { api, type State } from './api';
import { PrivacyContext } from './privacy';
import Logo from './components/Logo';
import SummaryCards from './components/SummaryCards';
import HistoryPanel from './components/HistoryPanel';
import PositionsTable from './components/PositionsTable';
import TransactionModal from './components/TransactionModal';
import TransactionList from './components/TransactionList';
import SettingsPanel from './components/SettingsPanel';

const PRIVACY_KEY = 'crypto-basis-privacy';

function EyeIcon({ off }: { off: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
      {off && <path d="M4 20 20 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />}
    </svg>
  );
}

export default function App() {
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState('');
  const [showClosed, setShowClosed] = useState(false);
  const [adding, setAdding] = useState(false);
  // 状态持久化，刷新后仍保持隐藏，不用每次都记得点
  const [privacy, setPrivacy] = useState(() => localStorage.getItem(PRIVACY_KEY) === '1');

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

  useEffect(() => {
    localStorage.setItem(PRIVACY_KEY, privacy ? '1' : '0');
  }, [privacy]);

  // H 键切换；在输入框里输入时不触发
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key !== 'h' && e.key !== 'H') return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      setPrivacy((v) => !v);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!state) return <main><p>{error || '加载中…'}</p></main>;

  return (
    <PrivacyContext.Provider value={privacy}>
      <main>
        <div className="page-head">
          <div className="brand">
            <Logo />
            <div className="brand-text">
              <h1>成本簿</h1>
              <span className="muted">USDT 持仓成本与收益</span>
            </div>
          </div>
          <div className="page-actions">
            <button
              className={`icon-btn ${privacy ? 'active' : ''}`}
              onClick={() => setPrivacy((v) => !v)}
              title={privacy ? '退出隐私模式（H）' : '隐私模式：隐藏金额与数量（H）'}
              aria-pressed={privacy}
            >
              <EyeIcon off={privacy} />
              <span>{privacy ? '已隐藏' : '隐私'}</span>
            </button>
            <button className="primary" onClick={() => setAdding(true)}>
              + 记一笔
            </button>
          </div>
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
    </PrivacyContext.Provider>
  );
}
