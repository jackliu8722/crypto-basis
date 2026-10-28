import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from './db.js';

/**
 * 生成数据库一致性快照。用 SQLite 的 backup API，服务正在运行也能安全执行，
 * 不需要先停服务，也不会受 WAL 未落盘影响。
 * 用法：npm --prefix server run snapshot
 */
const srcPath = path.join(DATA_DIR, 'ledger.db');
if (!fs.existsSync(srcPath)) {
  console.error(`没有找到数据库：${srcPath}`);
  process.exit(1);
}

const outDir = path.join(DATA_DIR, 'backups');
fs.mkdirSync(outDir, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const target = path.join(outDir, `ledger-${stamp}.db`);

const db = new Database(srcPath, { readonly: true });
await db.backup(target);
const count = db.prepare(`SELECT COUNT(*) c FROM transactions`).get().c;
db.close();

console.log(`快照已生成：${target}`);
console.log(`包含 ${count} 条交易记录，可直接复制到另一台机器作为 data/ledger.db 使用`);
