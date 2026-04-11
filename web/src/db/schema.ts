import { sql } from "drizzle-orm";
import { index, integer, pgEnum, pgTable, serial, text } from "drizzle-orm/pg-core";

export const circleStatusEnum = pgEnum("circle_status", ["incomplete", "complete"]);
export const serverMetaKeyEnum = pgEnum("server_meta_key", ["last_crawled"]);

export const circle = pgTable(
	"circle",
	{
		id: serial("id").primaryKey(),
		name: text("name").notNull(),
		megaLinks: text("mega_links").array().notNull().default(sql`ARRAY[]::text[]`),
		status: circleStatusEnum("status").notNull().default("incomplete"),
		statusText: text("status_text").notNull().default(""),
		missingLinks: text("missing_links").array().notNull().default(sql`ARRAY[]::text[]`),
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

export const serverMeta = pgTable("server_meta", {
	key: serverMetaKeyEnum("key").primaryKey(),
	value: text("value").notNull(),
});

export * from "./schema.auth.ts";
