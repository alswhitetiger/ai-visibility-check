CREATE TABLE IF NOT EXISTS improvement_checks (
 user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
 url TEXT NOT NULL, check_id TEXT NOT NULL, done INTEGER NOT NULL CHECK(done IN (0,1)),
 updated_at INTEGER NOT NULL, PRIMARY KEY(user_id,url,check_id)
);