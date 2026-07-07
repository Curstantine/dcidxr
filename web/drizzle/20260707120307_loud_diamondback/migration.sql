CREATE TABLE `circle` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`name` text NOT NULL,
	`mega_links` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'incomplete' NOT NULL,
	`status_text` text DEFAULT 'Missing releases' NOT NULL,
	`missing_link` text
);
--> statement-breakpoint
CREATE TABLE `release` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`name` text NOT NULL,
	`size_mb` integer NOT NULL,
	`mega_link` text NOT NULL,
	`circle_id` integer NOT NULL,
	CONSTRAINT `fk_release_circle_id_circle_id_fk` FOREIGN KEY (`circle_id`) REFERENCES `circle`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `server_meta` (
	`key` text PRIMARY KEY,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `track` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`name` text NOT NULL,
	`circle_id` integer NOT NULL,
	`release_id` integer NOT NULL,
	CONSTRAINT `fk_track_circle_id_circle_id_fk` FOREIGN KEY (`circle_id`) REFERENCES `circle`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_track_release_id_release_id_fk` FOREIGN KEY (`release_id`) REFERENCES `release`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `account` (
	`id` text PRIMARY KEY,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_account_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL UNIQUE,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	CONSTRAINT `fk_session_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`email` text NOT NULL UNIQUE,
	`email_verified` integer DEFAULT 0 NOT NULL,
	`image` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `circles_name_idx` ON `circle` (`name`);--> statement-breakpoint
CREATE INDEX `releases_name_idx` ON `release` (`name`);--> statement-breakpoint
CREATE INDEX `releases_circle_id_idx` ON `release` (`circle_id`);--> statement-breakpoint
CREATE INDEX `tracks_circle_id_idx` ON `track` (`circle_id`);--> statement-breakpoint
CREATE INDEX `tracks_release_id_idx` ON `track` (`release_id`);--> statement-breakpoint
CREATE INDEX `account_userId_idx` ON `account` (`user_id`);--> statement-breakpoint
CREATE INDEX `session_userId_idx` ON `session` (`user_id`);--> statement-breakpoint
CREATE INDEX `verification_identifier_idx` ON `verification` (`identifier`);