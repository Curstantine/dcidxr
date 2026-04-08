import { sql } from "drizzle-orm";
import { index, integer, pgEnum, pgTable, serial, text, uniqueIndex } from "drizzle-orm/pg-core";

export const user = pgTable(
	"user",
	{
		id: serial("id").primaryKey(),
		email: text("email").notNull(),
		password: text("password"),
	},
	(table) => [uniqueIndex("users_email_unique").on(table.email)],
);

export const circleStatusEnum = pgEnum("circle_status", ["incomplete", "complete"]);

export const circle = pgTable(
	"circle",
	{
		id: serial("id").primaryKey(),
		name: text("name").notNull(),
		megaLinks: text("mega_links")
			.array()
			.notNull()
			.default(sql`ARRAY[]::text[]`),
		status: circleStatusEnum("status").notNull().default("incomplete"),
		statusText: text("status_text").notNull().default(""),
		missingLinks: text("missing_links")
			.array()
			.notNull()
			.default(sql`ARRAY[]::text[]`),
	},
	(table) => [index("circles_name_idx").on(table.name)],
);

export const release = pgTable(
	"release",
	{
		id: serial("id").primaryKey(),
		name: text("name").notNull(),
		sizeMb: integer("size_mb").notNull(),
		megaLink: text("mega_link").notNull(),
		circleId: integer("circle_id")
			.notNull()
			.references(() => circle.id, { onDelete: "cascade" }),
	},
	(table) => [
		index("releases_name_idx").on(table.name),
		index("releases_circle_id_idx").on(table.circleId),
	],
);
