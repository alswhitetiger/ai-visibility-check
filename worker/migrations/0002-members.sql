CREATE TABLE IF NOT EXISTS user_sites (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  url TEXT NOT NULL, label TEXT NOT NULL, created_at INTEGER NOT NULL,
  UNIQUE(user_id, url)
);
CREATE TABLE IF NOT EXISTS scan_history (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  url TEXT NOT NULL, result_json TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS history_user_date ON scan_history(user_id, created_at DESC);
CREATE TABLE IF NOT EXISTS scan_requests (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  day TEXT NOT NULL, status TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS requests_user_day ON scan_requests(user_id, day);
CREATE INDEX IF NOT EXISTS requests_day ON scan_requests(day);
