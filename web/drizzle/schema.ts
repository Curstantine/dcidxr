import { pgTable, serial, text, uniqueIndex } from "drizzle-orm/pg-core";

export const users = pgTable(
	"users",
	{
		id: serial("id").primaryKey(),
		email: text("email").notNull(),
		password: text("password"),
	},
	(table) => [uniqueIndex("users_email_unique").on(table.email)],
);
