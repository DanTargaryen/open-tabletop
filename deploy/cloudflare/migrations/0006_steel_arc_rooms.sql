CREATE TABLE IF NOT EXISTS steel_arc_rooms (
  code TEXT PRIMARY KEY,
  revision INTEGER NOT NULL DEFAULT 0,
  payload TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS steel_arc_rooms_expires_at ON steel_arc_rooms(expires_at);

CREATE TABLE IF NOT EXISTS steel_arc_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS steel_arc_limits_expires_at ON steel_arc_limits(expires_at);
