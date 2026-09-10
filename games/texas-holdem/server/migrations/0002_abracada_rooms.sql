CREATE TABLE `abracada_limits` (
  `key` text PRIMARY KEY NOT NULL,
  `count` integer NOT NULL,
  `expires_at` integer NOT NULL
);

CREATE TABLE `abracada_rooms` (
  `code` text PRIMARY KEY NOT NULL,
  `revision` integer DEFAULT 0 NOT NULL,
  `payload` text NOT NULL,
  `expires_at` integer NOT NULL
);

CREATE INDEX `abracada_rooms_expires_at_idx` ON `abracada_rooms` (`expires_at`);
