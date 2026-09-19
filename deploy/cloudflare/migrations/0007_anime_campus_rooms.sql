CREATE TABLE `anime_campus_limits` (
  `key` text PRIMARY KEY NOT NULL,
  `count` integer NOT NULL,
  `expires_at` integer NOT NULL
);

CREATE TABLE `anime_campus_rooms` (
  `code` text PRIMARY KEY NOT NULL,
  `revision` integer DEFAULT 0 NOT NULL,
  `payload` text NOT NULL,
  `expires_at` integer NOT NULL
);

CREATE INDEX `anime_campus_rooms_expires_at_idx` ON `anime_campus_rooms` (`expires_at`);
