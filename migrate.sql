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
