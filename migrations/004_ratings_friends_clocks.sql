ALTER TABLE chess_match_queue ADD COLUMN IF NOT EXISTS time_control TEXT NOT NULL DEFAULT 'rapid';
ALTER TABLE chess_match_queue ADD COLUMN IF NOT EXISTS base_seconds INTEGER NOT NULL DEFAULT 600;
ALTER TABLE chess_match_queue ADD COLUMN IF NOT EXISTS increment_seconds INTEGER NOT NULL DEFAULT 0;
ALTER TABLE chess_rooms ADD COLUMN IF NOT EXISTS time_control TEXT NOT NULL DEFAULT 'rapid';
ALTER TABLE chess_rooms ADD COLUMN IF NOT EXISTS base_seconds INTEGER NOT NULL DEFAULT 600;
ALTER TABLE chess_rooms ADD COLUMN IF NOT EXISTS increment_seconds INTEGER NOT NULL DEFAULT 0;
ALTER TABLE chess_rooms ADD COLUMN IF NOT EXISTS white_time_ms BIGINT NOT NULL DEFAULT 600000;
ALTER TABLE chess_rooms ADD COLUMN IF NOT EXISTS black_time_ms BIGINT NOT NULL DEFAULT 600000;
ALTER TABLE chess_rooms ADD COLUMN IF NOT EXISTS clock_started_at TIMESTAMPTZ;
ALTER TABLE chess_rooms ADD COLUMN IF NOT EXISTS rated BOOLEAN NOT NULL DEFAULT TRUE;
CREATE TABLE IF NOT EXISTS chess_friend_requests (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  requester_id TEXT NOT NULL,
  recipient_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (requester_id <> recipient_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS chess_friend_requests_pair_idx ON chess_friend_requests(requester_id,recipient_id);
CREATE INDEX IF NOT EXISTS chess_friend_requests_recipient_idx ON chess_friend_requests(recipient_id,status,created_at);
CREATE TABLE IF NOT EXISTS chess_ratings (
  user_id TEXT NOT NULL,
  pool TEXT NOT NULL,
  rating INTEGER NOT NULL DEFAULT 1200,
  games INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  draws INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id,pool)
);
CREATE INDEX IF NOT EXISTS chess_ratings_pool_idx ON chess_ratings(pool,rating DESC);
CREATE TABLE IF NOT EXISTS chess_friend_challenges (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  challenger_id TEXT NOT NULL,
  challenged_id TEXT NOT NULL,
  room_id TEXT NOT NULL,
  time_control TEXT NOT NULL DEFAULT 'rapid',
  base_seconds INTEGER NOT NULL DEFAULT 600,
  increment_seconds INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (challenger_id <> challenged_id)
);
CREATE INDEX IF NOT EXISTS chess_friend_challenges_inbox_idx ON chess_friend_challenges(challenged_id,status,created_at);
CREATE TABLE IF NOT EXISTS chess_game_results (
  room_id TEXT PRIMARY KEY,
  white_id TEXT NOT NULL,
  black_id TEXT NOT NULL,
  time_control TEXT NOT NULL,
  result TEXT NOT NULL,
  white_rating_change INTEGER NOT NULL DEFAULT 0,
  black_rating_change INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);