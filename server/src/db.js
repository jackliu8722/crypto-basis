import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const srcDir = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = path.resolve(srcDir, '../../data');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const DB_PATH = path.join(DATA_DIR, 'ledger.db');

export function openDb() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.exec(fs.readFileSync(path.join(srcDir, 'schema.sql'), 'utf8'));
  migrate(db);
  backup();
  return db;
}

/** 已存在的库缺列时补上（CREATE TABLE IF NOT EXISTS 不会加列） */
function migrate(db) {
  const cols = db.prepare(`PRAGMA table_info(settings)`).all().map((c) => c.name);
  if (!cols.includes('proxy_url')) db.exec(`ALTER TABLE settings ADD COLUMN proxy_url TEXT`);
}

/** 启动时快照，保留最近 7 份；失败不影响启动 */
export function backup() {
  if (!fs.existsSync(DB_PATH)) return;
  try {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const day = new Date().toISOString().slice(0, 10);
    const target = path.join(BACKUP_DIR, `ledger-${day}.db`);
    if (!fs.existsSync(target)) fs.copyFileSync(DB_PATH, target);
    const files = fs.readdirSync(BACKUP_DIR).filter((f) => f.endsWith('.db')).sort();
    for (const old of files.slice(0, -7)) fs.rmSync(path.join(BACKUP_DIR, old));
  } catch (err) {
    console.warn('[backup] 跳过：', err.message);
  }
}
