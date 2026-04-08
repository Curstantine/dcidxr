import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "../../drizzle/schema";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
	throw new Error("DATABASE_URL is required");
}

const pg = postgres(databaseUrl, {
	ssl: resolveSsl(new URL(databaseUrl)),
	prepare: false,
});

export const db: PostgresJsDatabase<typeof schema> = drizzle(pg, { schema });

function resolveSsl(url: URL) {
	if (url.searchParams.has("sslmode")) return undefined;
	if (url.hostname === "localhost" || url.hostname === "127.0.0.1") return false;
	return "require" as const;
}
