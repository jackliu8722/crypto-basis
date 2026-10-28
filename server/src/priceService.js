import fs from 'node:fs';
import path from 'node:path';
import { fetch, ProxyAgent } from 'undici';
import { DATA_DIR } from './db.js';

const API = 'https://api.coingecko.com/api/v3';
const COINS_CACHE = path.join(DATA_DIR, 'coingecko-coins.json');

const BUILTIN_IDS = {
  BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana', BNB: 'bnb', XRP: 'ripple',
  DOGE: 'dogecoin', ADA: 'cardano', AVAX: 'avalanche-2', LINK: 'chainlink',
  DOT: 'polkadot', MATIC: 'matic-network', LTC: 'litecoin', TRX: 'tron',
  ATOM: 'cosmos', NEAR: 'near', APT: 'aptos', ARB: 'arbitrum', OP: 'optimism',
  SUI: 'sui', TON: 'the-open-network', FIL: 'filecoin', UNI: 'uniswap',
  AAVE: 'aave', INJ: 'injective-protocol', SEI: 'sei-network', TIA: 'celestia',
  PEPE: 'pepe', WIF: 'dogwifcoin', BCH: 'bitcoin-cash', ETC: 'ethereum-classic',
};

export function createPriceService(db, { proxy } = {}) {
  const getCached = db.prepare(`SELECT * FROM prices WHERE symbol = ?`);
  const upsertCached = db.prepare(`
    INSERT INTO prices (symbol, price_usdt, source, fetched_at) VALUES (@symbol, @price_usdt, @source, @fetched_at)
    ON CONFLICT(symbol) DO UPDATE SET price_usdt = @price_usdt, source = @source, fetched_at = @fetched_at
  `);
  const getOverride = db.prepare(`SELECT * FROM price_overrides WHERE symbol = ?`);
  const upsertOverride = db.prepare(`
    INSERT INTO price_overrides (symbol, price_usdt, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(symbol) DO UPDATE SET price_usdt = excluded.price_usdt, updated_at = excluded.updated_at
  `);
  const deleteOverride = db.prepare(`DELETE FROM price_overrides WHERE symbol = ?`);

  /**
   * 行情接口在国内网络通常要走代理。
   * 优先级：命令行 --proxy / --no-proxy > 环境变量 > 设置面板里存的 proxy_url
   */
  function proxyUrl() {
    if (proxy !== undefined) return proxy || null;
    const env = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
    if (env) return env;
    const row = db.prepare(`SELECT proxy_url FROM settings WHERE id = 1`).get();
    return row?.proxy_url || null;
  }

  function doFetch(url) {
    const p = proxyUrl();
    return fetch(url, p ? { dispatcher: new ProxyAgent(p) } : {});
  }

  async function resolveId(symbol) {
    if (BUILTIN_IDS[symbol]) return BUILTIN_IDS[symbol];
    let list = [];
    try {
      if (fs.existsSync(COINS_CACHE) && Date.now() - fs.statSync(COINS_CACHE).mtimeMs < 864e5) {
        list = JSON.parse(fs.readFileSync(COINS_CACHE, 'utf8'));
      } else {
        const res = await doFetch(`${API}/coins/list`);
        if (!res.ok) throw new Error(`coins/list ${res.status}`);
        list = await res.json();
        fs.mkdirSync(DATA_DIR, { recursive: true });
        fs.writeFileSync(COINS_CACHE, JSON.stringify(list));
      }
    } catch {
      return null;
    }
    const hit = list.find((c) => String(c.symbol).toUpperCase() === symbol);
    return hit ? hit.id : null;
  }

  return {
    /** @returns {Object<string, {price: number|null, stale: boolean, fetched_at: string|null, source: string}>} */
    async getPrices(symbols, { ttlSeconds = 300, force = false } = {}) {
      const now = Date.now();
      const out = {};
      const need = [];

      for (const raw of symbols) {
        const symbol = String(raw).toUpperCase();
        if (symbol === 'USDT') {
          out[symbol] = { price: 1, stale: false, fetched_at: null, source: 'fixed' };
          continue;
        }

        const ov = getOverride.get(symbol);
        if (ov) {
          out[symbol] = { price: ov.price_usdt, stale: false, fetched_at: ov.updated_at, source: 'manual' };
          continue;
        }

        const cached = getCached.get(symbol);
        const ageSeconds = cached ? (now - Date.parse(cached.fetched_at)) / 1000 : Infinity;
        if (cached && !force && ageSeconds < ttlSeconds) {
          out[symbol] = { price: cached.price_usdt, stale: false, fetched_at: cached.fetched_at, source: cached.source };
          continue;
        }
        out[symbol] = cached
          ? { price: cached.price_usdt, stale: true, fetched_at: cached.fetched_at, source: cached.source }
          : { price: null, stale: true, fetched_at: null, source: 'none' };
        need.push(symbol);
      }

      if (need.length > 0) {
        const idToSymbol = new Map();
        for (const symbol of need) {
          const id = await resolveId(symbol);
          if (id) idToSymbol.set(id, symbol);
        }
        if (idToSymbol.size > 0) {
          try {
            const url = `${API}/simple/price?ids=${[...idToSymbol.keys()].join(',')}&vs_currencies=usd`;
            const res = await doFetch(url);
            if (!res.ok) throw new Error(`simple/price ${res.status}`);
            const data = await res.json();
            const fetched_at = new Date().toISOString();
            for (const [id, symbol] of idToSymbol) {
              const price = data[id]?.usd;
              if (Number.isFinite(price)) {
                upsertCached.run({ symbol, price_usdt: price, source: 'coingecko', fetched_at });
                out[symbol] = { price, stale: false, fetched_at, source: 'coingecko' };
              }
            }
          } catch (err) {
            console.warn('[price] 取价失败，沿用缓存：', err.message);
          }
        }
      }
      return out;
    },

    setOverride(symbol, price) {
      const s = String(symbol).toUpperCase();
      const n = Number(price);
      if (!Number.isFinite(n) || n <= 0) throw new Error('价格必须是大于 0 的数字');
      upsertOverride.run(s, n, new Date().toISOString());
    },

    clearOverride(symbol) {
      deleteOverride.run(String(symbol).toUpperCase());
    },

    currentProxy: proxyUrl,

    // 供历史价格抓取复用（币种映射与带代理的请求）
    resolveId: (symbol) => resolveId(symbol),
    fetchJson: async (url) => (await doFetch(url)).json(),
  };
}
