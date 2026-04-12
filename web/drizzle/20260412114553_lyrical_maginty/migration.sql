CREATE TYPE "circle_status" AS ENUM('incomplete', 'complete');--> statement-breakpoint
CREATE TYPE "server_meta_key" AS ENUM('last_crawled', 'last_indexed');--> statement-breakpoint
CREATE TABLE "circle" (
	"id" serial PRIMARY KEY,
	"name" text NOT NULL,
	"mega_links" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"status" "circle_status" DEFAULT 'incomplete'::"circle_status" NOT NULL,
	"status_text" text DEFAULT 'Missing releases' NOT NULL,
	"missing_link" text
);
--> statement-breakpoint
CREATE TABLE "release" (
	"id" serial PRIMARY KEY,
	"name" text NOT NULL,
	"size_mb" integer NOT NULL,
	"mega_link" text NOT NULL,
	"circle_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "server_meta" (
	"key" "server_meta_key" PRIMARY KEY,
	"value" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "track" (
	"id" serial PRIMARY KEY,
	"name" text NOT NULL,
	"circle_id" integer NOT NULL,
	"release_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL UNIQUE,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY,
	"name" text NOT NULL,
	"email" text NOT NULL UNIQUE,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "circles_name_idx" ON "circle" ("name");--> statement-breakpoint
CREATE INDEX "releases_name_idx" ON "release" ("name");--> statement-breakpoint
CREATE INDEX "releases_circle_id_idx" ON "release" ("circle_id");--> statement-breakpoint
CREATE INDEX "tracks_circle_id_idx" ON "track" ("circle_id");--> statement-breakpoint
CREATE INDEX "tracks_release_id_idx" ON "track" ("release_id");--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" ("user_id");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" ("identifier");--> statement-breakpoint
ALTER TABLE "release" ADD CONSTRAINT "release_circle_id_circle_id_fkey" FOREIGN KEY ("circle_id") REFERENCES "circle"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "track" ADD CONSTRAINT "track_circle_id_circle_id_fkey" FOREIGN KEY ("circle_id") REFERENCES "circle"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "track" ADD CONSTRAINT "track_release_id_release_id_fkey" FOREIGN KEY ("release_id") REFERENCES "release"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;