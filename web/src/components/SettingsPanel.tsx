import { useState } from 'react';
import { api, type State } from '../api';

export default function SettingsPanel({ state, onChanged }: { state: State; onChanged: () => void }) {
  const [capital, setCapital] = useState(String(state.settings.initial_capital_usdt));
  const [proxy, setProxy] = useState(state.settings.proxy_url ?? '');
  const [symbol, setSymbol] = useState('');
  const [price, setPrice] = useState('');
  const [busy, setBusy] = useState(false);

  async function save() {
    await api.updateSettings({ initial_capital_usdt: Number(capital), proxy_url: proxy || null });
    onChanged();
  }

  async function refresh() {
    setBusy(true);
    try {
      await api.refreshPrices();
    } finally {
      setBusy(false);
    }
    onChanged();
  }

  async function overridePrice() {
    await api.setPrice(symbol.toUpperCase(), Number(price));
    setSymbol('');
    setPrice('');
    onChanged();
  }

  return (
    <section>
      <header className="section-head">
        <h2>设置</h2>
      </header>
      <div className="form">
        <label className="field field-money">
          <span>初始本金 USDT</span>
          <input value={capital} onChange={(e) => setCapital(e.target.value)} inputMode="decimal" />
        </label>
        <label className="field field-grow">
          <span>行情代理地址</span>
          <input
            placeholder="如 http://127.0.0.1:7890"
            value={proxy}
            onChange={(e) => setProxy(e.target.value)}
          />
        </label>
        <button className="primary" onClick={save}>
          保存
        </button>
      </div>
      <div className="form">
        <button onClick={refresh} disabled={busy}>
          {busy ? '刷新中…' : '刷新价格'}
        </button>
        <label className="field field-symbol">
          <span>币种</span>
          <input
            placeholder="BTC"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            autoCapitalize="characters"
            spellCheck={false}
          />
        </label>
        <label className="field field-money">
          <span>手动价格</span>
          <input
            placeholder="0.00"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            inputMode="decimal"
          />
        </label>
        <button onClick={overridePrice}>覆盖价格</button>
      </div>
      <p className="muted">
        {proxy ? '' : '未填代理地址时，国内网络通常取不到行情价格，可手动填价。'}
        <a href="/api/export?format=csv">导出 CSV</a> · <a href="/api/export">导出 JSON</a>
      </p>
    </section>
  );
}
