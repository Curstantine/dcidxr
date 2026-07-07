import { sql } from "drizzle-orm";
import { customType, index, integer, int, sqliteTable, text } from "drizzle-orm/sqlite-core";

const jsonArray = customType<{ data: string[]; driverData: string }>({
	dataType() {
		return "text";
	},
	toDriver(value: string[]): string {
		return JSON.stringify(value);
	},
	fromDriver(value: string): string[] {
		return JSON.parse(value);
	},
});

export const circle = sqliteTable(
	"circle",
	{
		id: int("id").primaryKey({ autoIncrement: true }),
		name: text("name").notNull(),
		megaLinks: jsonArray("mega_links")
			.notNull()
			.default(sql`'[]'`),
		status: text("status", { enum: ["missing", "incomplete", "complete"] })
			.notNull()
			.default("incomplete"),
		statusText: text("status_text").notNull().default("Missing releases"),
		missingLink: text("missing_link"),
	},
	(table) => [index("circles_name_idx").on(table.name)],
);

export const release = sqliteTable(
	"release",
	{
		id: int("id").primaryKey({ autoIncrement: true }),
		name: text("name").notNull(),
		sizeMb: integer("size_mb").notNull(),
		megaLink: text("mega_link").notNull(),
		circleId: int("circle_id")
			.notNull()
			.references(() => circle.id, { onDelete: "cascade" }),
	},
	(table) => [
		index("releases_name_idx").on(table.name),
		index("releases_circle_id_idx").on(table.circleId),
	],
);

export const track = sqliteTable(
	"track",
	{
		id: int("id").primaryKey({ autoIncrement: true }),
		name: text("name").notNull(),
		circleId: int("circle_id")
			.notNull()
			.references(() => circle.id, { onDelete: "cascade" }),
		releaseId: int("release_id")
			.notNull()
			.references(() => release.id, { onDelete: "cascade" }),
	},
	(table) => [
		index("tracks_circle_id_idx").on(table.circleId),
		index("tracks_release_id_idx").on(table.releaseId),
	],
);

export const serverMeta = sqliteTable("server_meta", {
	key: text("key", { enum: ["last_crawled", "last_indexed"] }).primaryKey(),
	value: text("value").notNull(),
});

export * from "./schema.auth.ts";
