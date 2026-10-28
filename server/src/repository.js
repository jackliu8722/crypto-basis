import { availableQuantity } from './engine.js';

export function createRepository(db) {
  const insertTxn = db.prepare(`
    INSERT INTO transactions (ts, type, symbol, quantity, total_usdt, note, created_at)
    VALUES (@ts, @type, @symbol, @quantity, @total_usdt, @note, @created_at)
  `);
  const selectActive = db.prepare(`SELECT * FROM transactions WHERE deleted_at IS NULL ORDER BY ts ASC, id ASC`);
  const selectBySymbol = db.prepare(`SELECT * FROM transactions WHERE deleted_at IS NULL AND symbol = ? ORDER BY ts ASC, id ASC`);
  const softDelete = db.prepare(`UPDATE transactions SET deleted_at = ? WHERE id = ?`);
  const restore = db.prepare(`UPDATE transactions SET deleted_at = NULL WHERE id = ?`);

  return {
    listTransactions(symbol) {
      return symbol ? selectBySymbol.all(String(symbol).toUpperCase()) : selectActive.all();
    },

    /** @throws {Error} 校验失败时 message 直接面向用户 */
    addTransaction(input) {
      const type = String(input.type ?? '').toUpperCase();
      if (!['BUY', 'SELL', 'DEPOSIT', 'WITHDRAW'].includes(type)) throw new Error('未知的交易类型');

      const total = Number(input.total_usdt);
      if (!Number.isFinite(total) || total <= 0) throw new Error('USDT 金额必须是大于 0 的数字');

      const ts = input.ts ? new Date(input.ts).toISOString() : new Date().toISOString();
      if (Number.isNaN(Date.parse(ts))) throw new Error('时间格式不正确');

      let symbol = null;
      let quantity = null;

      if (type === 'BUY' || type === 'SELL') {
        symbol = String(input.symbol ?? '').trim().toUpperCase();
        if (!symbol) throw new Error('请填写币种');
        quantity = Number(input.quantity);
        if (!Number.isFinite(quantity) || quantity <= 0) throw new Error('数量必须是大于 0 的数字');

        if (type === 'SELL') {
          const available = availableQuantity(selectActive.all(), symbol, ts, Number.MAX_SAFE_INTEGER);
          if (quantity > available + 1e-8) {
            throw new Error(`卖出数量超过持仓：${symbol} 当前仅持有 ${available}`);
          }
        }
      }

      const row = {
        ts,
        type,
        symbol,
        quantity,
        total_usdt: total,
        note: input.note ? String(input.note) : null,
        created_at: new Date().toISOString(),
      };
      const info = insertTxn.run(row);
      return { id: Number(info.lastInsertRowid), ...row };
    },

    deleteTransaction(id) {
      const info = softDelete.run(new Date().toISOString(), id);
      if (info.changes === 0) throw new Error('记录不存在');
    },

    restoreTransaction(id) {
      const info = restore.run(id);
      if (info.changes === 0) throw new Error('记录不存在');
    },

    getSettings() {
      return db.prepare(`SELECT * FROM settings WHERE id = 1`).get();
    },

    updateSettings(patch) {
      const cur = this.getSettings();
      db.prepare(`UPDATE settings SET initial_capital_usdt = ?, price_ttl_seconds = ?, proxy_url = ? WHERE id = 1`).run(
        patch.initial_capital_usdt ?? cur.initial_capital_usdt,
        patch.price_ttl_seconds ?? cur.price_ttl_seconds,
        patch.proxy_url ?? cur.proxy_url,
      );
      return this.getSettings();
    },
  };
}
