-- Cloudflare D1 / SQLite schema for Chess Network.
-- The original PostgreSQL migrations are retained as reference; this file is the D1-compatible target schema.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS app_users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Store only hashes of short-lived email codes and session tokens.
CREATE TABLE IF NOT EXISTS email_login_codes (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL COLLATE NOCASE,
  code_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS email_login_codes_email_idx ON email_login_codes(email, expires_at);

CREATE TABLE IF NOT EXISTS app_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS app_sessions_user_idx ON app_sessions(user_id, expires_at);

CREATE TABLE IF NOT EXISTS chess_rooms (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'waiting',
  fen TEXT NOT NULL,
  pgn TEXT NOT NULL DEFAULT '',
  white_id TEXT,
  black_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  last_move_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  time_control TEXT NOT NULL DEFAULT 'rapid',
  base_seconds INTEGER NOT NULL DEFAULT 600,
  increment_seconds INTEGER NOT NULL DEFAULT 0,
  white_time_ms INTEGER NOT NULL DEFAULT 600000,
  black_time_ms INTEGER NOT NULL DEFAULT 600000,
  clock_started_at TEXT,
  rated INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS chess_match_queue (
  user_id TEXT PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL DEFAULT 'Chess player',
  status TEXT NOT NULL DEFAULT 'waiting',
  room_id TEXT,
  joined_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  time_control TEXT NOT NULL DEFAULT 'rapid',
  base_seconds INTEGER NOT NULL DEFAULT 600,
  increment_seconds INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS chess_match_queue_waiting_idx ON chess_match_queue(status, time_control, joined_at);

CREATE TABLE IF NOT EXISTS chess_friends (
  user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  friend_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (user_id, friend_id),
  CHECK (user_id <> friend_id)
);
CREATE INDEX IF NOT EXISTS chess_friends_friend_idx ON chess_friends(friend_id, user_id);

CREATE TABLE IF NOT EXISTS chess_friend_requests (
  id TEXT PRIMARY KEY,
  requester_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  recipient_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK (requester_id <> recipient_id),
  UNIQUE (requester_id, recipient_id)
);
CREATE INDEX IF NOT EXISTS chess_friend_requests_recipient_idx ON chess_friend_requests(recipient_id, status, created_at);

CREATE TABLE IF NOT EXISTS chess_ratings (
  user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  pool TEXT NOT NULL,
  rating INTEGER NOT NULL DEFAULT 1200,
  games INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  draws INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (user_id, pool)
);
CREATE INDEX IF NOT EXISTS chess_ratings_pool_idx ON chess_ratings(pool, rating DESC);

CREATE TABLE IF NOT EXISTS chess_friend_challenges (
  id TEXT PRIMARY KEY,
  challenger_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  challenged_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  room_id TEXT NOT NULL,
  time_control TEXT NOT NULL DEFAULT 'rapid',
  base_seconds INTEGER NOT NULL DEFAULT 600,
  increment_seconds INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK (challenger_id <> challenged_id)
);
CREATE INDEX IF NOT EXISTS chess_friend_challenges_inbox_idx ON chess_friend_challenges(challenged_id, status, created_at);

CREATE TABLE IF NOT EXISTS chess_game_results (
  room_id TEXT PRIMARY KEY,
  white_id TEXT NOT NULL,
  black_id TEXT NOT NULL,
  time_control TEXT NOT NULL,
  result TEXT NOT NULL,
  white_rating_change INTEGER NOT NULL DEFAULT 0,
  black_rating_change INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
