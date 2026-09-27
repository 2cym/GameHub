CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  username TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at DESC);

CREATE TABLE IF NOT EXISTS friendships (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  friend_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(user_id, friend_id)
);
CREATE INDEX IF NOT EXISTS idx_friends_user ON friendships(user_id);
CREATE INDEX IF NOT EXISTS idx_friends_friend ON friendships(friend_id);

CREATE TABLE IF NOT EXISTS game_rooms (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL,
  host_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  player_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  host_color TEXT NOT NULL DEFAULT 'r',
  player_color TEXT NOT NULL DEFAULT 'b',
  board_state TEXT NOT NULL DEFAULT '[]',
  current_turn TEXT NOT NULL DEFAULT 'r',
  last_move TEXT,
  status TEXT NOT NULL DEFAULT 'waiting',
  moves_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_rooms_status ON game_rooms(status);
CREATE INDEX IF NOT EXISTS idx_rooms_host ON game_rooms(host_id);
CREATE INDEX IF NOT EXISTS idx_rooms_player ON game_rooms(player_id);

CREATE TABLE IF NOT EXISTS game_histories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id TEXT NOT NULL,
  game_id TEXT NOT NULL,
  player_id TEXT NOT NULL,
  opponent_id TEXT NOT NULL,
  winner TEXT,
  moves INTEGER NOT NULL,
  duration INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_history_player ON game_histories(player_id);

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

CREATE TABLE IF NOT EXISTS ai_usage (
  user_id TEXT NOT NULL,
  date    TEXT NOT NULL,
  used    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, date)
);

-- 站点设置（管理后台可调）；key 白名单在 worker 端校验，缺值时用代码默认。
CREATE TABLE IF NOT EXISTS site_settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- 收藏分类：favorites 只回答「是否收藏」，这里记录「放在哪一组」。
-- 用新表而不是给 favorites 加列——全库没有 ALTER TABLE 先例，新表可随时安全初始化，
-- 老收藏缺行时由读取端 COALESCE 兜到默认分类，无需数据回填。
CREATE TABLE IF NOT EXISTS favorites_meta (
  user_id  TEXT NOT NULL,
  game_id  TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '常玩',
  PRIMARY KEY (user_id, game_id),
  FOREIGN KEY (user_id, game_id) REFERENCES favorites(user_id, game_id) ON DELETE CASCADE
);

-- 用户资料（头像）：emoji 文本 + 调色板下标，零存储成本、零上传面。
-- 独立新表而非给 users 加列——全库没有 ALTER TABLE 先例，且资料查询可与鉴权查询解耦。
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
CREATE TABLE IF NOT EXISTS user_password_changes (
  user_id    TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  changed_at INTEGER NOT NULL DEFAULT (unixepoch())
);
