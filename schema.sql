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

-- 留言板
CREATE TABLE IF NOT EXISTS messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  username   TEXT NOT NULL,
  content    TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at DESC);

-- 好友关系
CREATE TABLE IF NOT EXISTS friendships (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  friend_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(user_id, friend_id)
);

CREATE INDEX IF NOT EXISTS idx_friends_user ON friendships(user_id);
CREATE INDEX IF NOT EXISTS idx_friends_friend ON friendships(friend_id);

-- 好友对局房间
CREATE TABLE IF NOT EXISTS game_rooms (
  id            TEXT PRIMARY KEY,
  game_id       TEXT NOT NULL,
  host_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  player_id     TEXT REFERENCES users(id) ON DELETE CASCADE,
  host_color    TEXT NOT NULL DEFAULT 'r',
  player_color  TEXT NOT NULL DEFAULT 'b',
  board_state   TEXT NOT NULL DEFAULT '[]',
  current_turn  TEXT NOT NULL DEFAULT 'r',
  last_move     TEXT,
  status        TEXT NOT NULL DEFAULT 'waiting',
  moves_count   INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at    INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_rooms_status ON game_rooms(status);
CREATE INDEX IF NOT EXISTS idx_rooms_host ON game_rooms(host_id);
CREATE INDEX IF NOT EXISTS idx_rooms_player ON game_rooms(player_id);

-- 对局历史
CREATE TABLE IF NOT EXISTS game_histories (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id    TEXT NOT NULL,
  game_id    TEXT NOT NULL,
  player_id  TEXT NOT NULL,
  opponent_id TEXT NOT NULL,
  winner     TEXT,
  moves      INTEGER NOT NULL,
  duration   INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_history_player ON game_histories(player_id);

-- 管理员网盘
CREATE TABLE IF NOT EXISTS files (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  filename     TEXT NOT NULL,
  content_type TEXT NOT NULL DEFAULT 'application/octet-stream',
  size         INTEGER NOT NULL,
  total_chunks INTEGER NOT NULL,
  created_at   INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS file_chunks (
  file_id     INTEGER NOT NULL,
  chunk_index INTEGER NOT NULL,
  data        TEXT NOT NULL,
  PRIMARY KEY (file_id, chunk_index),
  FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE
);

-- 棋类 AI 用量（Cloudflare Workers AI 每日额度计数）
CREATE TABLE IF NOT EXISTS ai_usage (
  user_id TEXT NOT NULL,
  date    TEXT NOT NULL,
  used    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, date)
);
