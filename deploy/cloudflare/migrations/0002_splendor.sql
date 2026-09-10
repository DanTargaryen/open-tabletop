CREATE TABLE splendor_rooms (
  code TEXT PRIMARY KEY NOT NULL,
  revision INTEGER NOT NULL,
  payload TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX idx_splendor_rooms_expires_at ON splendor_rooms(expires_at);
CREATE TABLE splendor_limits (
  key TEXT PRIMARY KEY NOT NULL,
  count INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX idx_splendor_limits_expires_at ON splendor_limits(expires_at);
