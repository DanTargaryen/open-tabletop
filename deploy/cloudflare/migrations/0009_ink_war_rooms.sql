CREATE TABLE ink_war_rooms (
  code TEXT PRIMARY KEY NOT NULL,
  revision INTEGER DEFAULT 0 NOT NULL,
  payload TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX ink_war_rooms_expires_at ON ink_war_rooms(expires_at);
CREATE TABLE ink_war_limits (
  key TEXT PRIMARY KEY NOT NULL,
  count INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX ink_war_limits_expires_at ON ink_war_limits(expires_at);
