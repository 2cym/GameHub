-- GameHub D1 schema
-- 本地：npm run db:init:local
-- 线上：npm run db:init:remote（需先 wrangler d1 create gamehub-db 并更新 wrangler.jsonc）

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  salt          TEXT NOT NULL,
  is_admin      INTEGER NOT NULL DEFAULT 0,
  is_banned     INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS scores (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game_id    TEXT NOT NULL,
  score      INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_scores_game_score ON scores(game_id, score DESC);
CREATE INDEX IF NOT EXISTS idx_scores_user ON scores(user_id, game_id);

CREATE TABLE IF NOT EXISTS favorites (
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game_id    TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (user_id, game_id)
);

-- 邮箱验证码（注册 / 重置密码共用），每个邮箱每种用途只保留最新一条
CREATE TABLE IF NOT EXISTS email_verifications (
  email      TEXT NOT NULL COLLATE NOCASE,
  purpose    TEXT NOT NULL,
  code_hash  TEXT NOT NULL,
  salt       TEXT NOT NULL,
  attempts   INTEGER NOT NULL DEFAULT 0,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (email, purpose)
);

-- 页面访问记录（流量监控）
CREATE TABLE IF NOT EXISTS page_views (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  path       TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_pv_created ON page_views(created_at);
