ALTER TYPE "circle_status" ADD VALUE 'missing' BEFORE 'incomplete';--> statement-breakpoint
ALTER TABLE "circle" ADD COLUMN "last_updated" text;