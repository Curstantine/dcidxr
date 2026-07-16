import { drizzle } from "drizzle-orm/neon-http";

import { relations } from "@/db/relations";

import { env } from "@/env";

export const db = drizzle(env.DATABASE_URL, { relations });
