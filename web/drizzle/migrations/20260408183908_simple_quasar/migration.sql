CREATE TYPE "circle_status" AS ENUM('incomplete', 'complete');--> statement-breakpoint
CREATE TABLE "circle" (
	"id" serial PRIMARY KEY,
	"name" text NOT NULL,
	"mega_links" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"status" "circle_status" DEFAULT 'incomplete'::"circle_status" NOT NULL,
	"status_text" text DEFAULT '' NOT NULL,
	"missing_links" text[] DEFAULT ARRAY[]::text[] NOT NULL
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
CREATE TABLE "user" (
	"id" serial PRIMARY KEY,
	"email" text NOT NULL,
	"password" text
);
--> statement-breakpoint
CREATE INDEX "circles_name_idx" ON "circle" ("name");--> statement-breakpoint
CREATE INDEX "releases_name_idx" ON "release" ("name");--> statement-breakpoint
CREATE INDEX "releases_circle_id_idx" ON "release" ("circle_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "user" ("email");--> statement-breakpoint
ALTER TABLE "release" ADD CONSTRAINT "release_circle_id_circle_id_fkey" FOREIGN KEY ("circle_id") REFERENCES "circle"("id") ON DELETE CASCADE;