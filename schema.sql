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
-- host_id / player_id 必须是 users.id（D1 会强制 foreign_keys，已用回滚失败的插入验证过）。
-- 游客因此也需要一行 users 记录：id = 'guest:<deviceId>'，email 用 @gamehub.invalid
-- 域名，password_hash 是随机值所以永远登不上。这样 REFERENCES 成立，昵称直接落在
-- users.username，显示名不需要额外的映射表。
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

-- 棋类 AI 用量计数。已取消步数上限，当前无代码读写本表；恢复额度限制时再启用。
CREATE TABLE IF NOT EXISTS ai_usage (
  user_id TEXT NOT NULL,
  date    TEXT NOT NULL,
  used    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, date)
);

-- 站点设置（管理后台可调）。key 白名单在 worker 端校验，缺值时用代码默认。
CREATE TABLE IF NOT EXISTS site_settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- 收藏分类：favorites 只回答「是否收藏」，这里记录「放在哪一组」。
-- 用新表而不是给 favorites 加列，老收藏缺行时由读取端 COALESCE 兜到默认分类。
CREATE TABLE IF NOT EXISTS favorites_meta (
  user_id  TEXT NOT NULL,
  game_id  TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '常玩',
  PRIMARY KEY (user_id, game_id),
  FOREIGN KEY (user_id, game_id) REFERENCES favorites(user_id, game_id) ON DELETE CASCADE
);

-- 用户资料（头像）：emoji 文本 + 调色板下标，零存储成本、零上传面。
-- 独立新表而非给 users 加列，资料查询可与鉴权查询解耦。
CREATE TABLE IF NOT EXISTS user_profile (
  user_id      TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  avatar_emoji TEXT NOT NULL DEFAULT '',
  avatar_color TEXT NOT NULL DEFAULT '0',
  updated_at   INTEGER NOT NULL DEFAULT (unixepoch())
);

-- 每日游玩时长：前端定时上报增量秒数，按「用户+游戏+日期」聚合累加。
-- date 是服务端生成的 UTC 日期字符串（YYYY-MM-DD），不信任客户端时间。
CREATE TABLE IF NOT EXISTS play_session_times (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game_id TEXT NOT NULL,
  date    TEXT NOT NULL,
  seconds INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, game_id, date)
);

CREATE INDEX IF NOT EXISTS idx_playtime_user_date ON play_session_times(user_id, date);

-- 密码变更时间戳：改密码/被管理员重置时 upsert，鉴权时对比 token.iat 吊销更早的令牌。
-- 独立表而非给 users 加列——全库没有 ALTER TABLE 先例，且吊销查询可与用户加载解耦。
-- 每用户至多一行（只有最新一次变更有意义），用户删除时级联清理。
CREATE TABLE IF NOT EXISTS user_password_changes (
  user_id    TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  changed_at INTEGER NOT NULL DEFAULT (unixepoch())
);
