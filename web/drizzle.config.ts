import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: [".env.local", ".env"] });

if (!process.env.TURSO_DATABASE_URL) {
	throw new Error("[drizzle]: TURSO_DATABASE_URL is not set");
}

if (!process.env.TURSO_AUTH_TOKEN) {
	throw new Error("[drizzle]: TURSO_AUTH_TOKEN is not set");
}

export default defineConfig({
	strict: true,
	out: "./drizzle",
	schema: "./src/db/schema.ts",
	dialect: "turso",
	dbCredentials: {
		url: process.env.TURSO_DATABASE_URL,
		authToken: process.env.TURSO_AUTH_TOKEN,
	},
});
