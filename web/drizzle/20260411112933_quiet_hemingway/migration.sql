CREATE TYPE "server_meta_key" AS ENUM('last_crawled');--> statement-breakpoint
CREATE TABLE "server_meta" (
	"key" "server_meta_key" PRIMARY KEY,
	"value" text NOT NULL
);
