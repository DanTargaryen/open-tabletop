CREATE TABLE `aeroplane_limits` (
  `key` text PRIMARY KEY NOT NULL,
  `count` integer NOT NULL,
  `expires_at` integer NOT NULL
);

CREATE TABLE `aeroplane_rooms` (
  `code` text PRIMARY KEY NOT NULL,
  `revision` integer DEFAULT 0 NOT NULL,
  `payload` text NOT NULL,
  `expires_at` integer NOT NULL
);

CREATE INDEX `aeroplane_rooms_expires_at_idx` ON `aeroplane_rooms` (`expires_at`);
