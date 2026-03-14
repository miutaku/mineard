-- Mineard D1 Schema

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  totp_secret TEXT,
  totp_setup_complete INTEGER NOT NULL DEFAULT 0,
  is_admin INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  cust_id TEXT NOT NULL UNIQUE,
  refresh_token TEXT NOT NULL,
  id_token TEXT,
  token_expires_at TEXT,
  yuzurune_enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS gift_pairs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  target_account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS job_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_type TEXT NOT NULL,
  account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
  status TEXT NOT NULL,
  message TEXT,
  gift_code TEXT,
  packet_amount INTEGER,
  executed_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS app_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_accounts_user_id ON accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_job_logs_job_type ON job_logs(job_type);
CREATE INDEX IF NOT EXISTS idx_job_logs_executed_at ON job_logs(executed_at);
CREATE INDEX IF NOT EXISTS idx_job_logs_account_id ON job_logs(account_id);
