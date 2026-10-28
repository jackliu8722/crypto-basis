CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  initial_capital_usdt REAL NOT NULL DEFAULT 0,
  price_ttl_seconds INTEGER NOT NULL DEFAULT 300,
  proxy_url TEXT
);
INSERT OR IGNORE INTO settings (id) VALUES (1);

CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('BUY','SELL','DEPOSIT','WITHDRAW')),
  symbol TEXT,
  quantity REAL,
  total_usdt REAL NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_txn_ts ON transactions (ts, id);
CREATE INDEX IF NOT EXISTS idx_txn_symbol ON transactions (symbol);

CREATE TABLE IF NOT EXISTS prices (
  symbol TEXT PRIMARY KEY,
  price_usdt REAL NOT NULL,
  source TEXT NOT NULL,
  fetched_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS price_overrides (
  symbol TEXT PRIMARY KEY,
  price_usdt REAL NOT NULL,
  updated_at TEXT NOT NULL
);
