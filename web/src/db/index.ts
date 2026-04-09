import { drizzle } from "drizzle-orm/node-postgres";

import { relations } from "./schema.ts";

if (!process.env.DATABASE_URL) {
	throw new Error("[db]: DATABASE_URL is not set");
}

export const db = drizzle(process.env.DATABASE_URL, { relations });
