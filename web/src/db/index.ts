import { drizzle } from "drizzle-orm/node-postgres";

import { relations } from "@/db/relations";
import { env } from "@/env";

export const db = drizzle(env.DATABASE_URL, { relations });
