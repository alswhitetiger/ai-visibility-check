-- 진단 결과 캐시. 같은 URL은 CACHE_TTL_HOURS 동안 재사용한다.
CREATE TABLE IF NOT EXISTS scans (
  url          TEXT PRIMARY KEY,
  host         TEXT NOT NULL,
  ai_score     INTEGER NOT NULL,
  ux_score     INTEGER NOT NULL,
  quadrant     TEXT NOT NULL,
  result_json  TEXT NOT NULL,
  provider     TEXT,
  model        TEXT,
  created_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_scans_created ON scans (created_at DESC);

-- 일일 사용량 카운터. key 예: "global:2026-09-04", "ip:1.2.3.4:2026-09-04"
CREATE TABLE IF NOT EXISTS usage (
  key        TEXT PRIMARY KEY,
  count      INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);

-- 공개 쇼케이스. 옵트인한 항목만 노출한다.
CREATE TABLE IF NOT EXISTS showcase (
  host       TEXT PRIMARY KEY,
  label      TEXT NOT NULL,
  ai_score   INTEGER NOT NULL,
  ux_score   INTEGER NOT NULL,
  opted_in   INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);

-- AI 응답 보관소. 진단 캐시(scans)와 분리한다.
-- Gemini 무료 티어는 Cloudflare 콜로 위치에 따라 간헐적으로 거부당하는데,
-- 한 번 성공한 응답을 오래 남겨 두면 그 실패를 덮을 수 있다.
CREATE TABLE IF NOT EXISTS ai_answers (
  host        TEXT PRIMARY KEY,
  answer_json TEXT NOT NULL,
  provider    TEXT NOT NULL,
  model       TEXT NOT NULL,
  created_at  INTEGER NOT NULL
);
