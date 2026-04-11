import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { tanstackStartCookies } from "better-auth/tanstack-start";

import { db } from "@/db";
import { env } from "@/env";
import * as schema from "@/db/schema";

export const auth = betterAuth({
	database: drizzleAdapter(db, { provider: "sqlite", schema }),
	socialProviders: {
		discord: {
			enabled: true,
			clientId: env.DISCORD_ID,
			clientSecret: env.DISCORD_SECRET,
			scopes: ["identify", "email", "guilds", "guilds.members.read"],
		},
	},
	plugins: [tanstackStartCookies()],
});
