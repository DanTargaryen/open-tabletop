CREATE TABLE buckshot_rooms (
  code TEXT PRIMARY KEY NOT NULL,
  revision INTEGER NOT NULL,
  payload TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX idx_buckshot_rooms_expires_at ON buckshot_rooms(expires_at);
CREATE TABLE buckshot_limits (
  key TEXT PRIMARY KEY NOT NULL,
  count INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX idx_buckshot_limits_expires_at ON buckshot_limits(expires_at);
