import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { tanstackStartCookies } from "better-auth/tanstack-start";

import { db } from "@/db";
import { env } from "@/env";

export const auth = betterAuth({
	database: drizzleAdapter(db, { provider: "sqlite" }),
	socialProviders: {
		discord: {
			enabled: true,
			clientId: env.DISCORD_ID,
			clientSecret: env.DISCORD_SECRET,
		},
	},
	plugins: [tanstackStartCookies()],
});
