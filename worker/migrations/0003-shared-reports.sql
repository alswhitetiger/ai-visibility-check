CREATE TABLE IF NOT EXISTS shared_reports (
  token TEXT PRIMARY KEY,
  user_id TEXT REFERENCES user(id) ON DELETE CASCADE,
  result_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS shared_reports_expiry ON shared_reports(expires_at);
