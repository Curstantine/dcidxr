import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { tanstackStartCookies } from "better-auth/tanstack-start";

import { checkDiscordAccess } from "@/auth/func";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { env } from "@/env";

export const auth = betterAuth({
	rateLimit: {
		enabled: true,
	},
	database: drizzleAdapter(db, { provider: "sqlite", schema }),
	socialProviders: {
		discord: {
			enabled: true,
			clientId: env.DISCORD_ID,
			clientSecret: env.DISCORD_SECRET,
			scope: ["identify", "email", "guilds.members.read"],
		},
	},
	hooks: {
		after: createAuthMiddleware(async (ctx) => {
			if (!(ctx.path === "/callback/:id" && ctx.params.id === "discord")) return;
			if (ctx.context.newSession === null) {
				throw new APIError("UNAUTHORIZED", { message: "No session" });
			}

			const discordAccessToken = await auth.api.getAccessToken({
				body: { providerId: "discord", userId: ctx.context.newSession.user.id },
			});

			// The OAuth response is on the context after the callback
			const accessToken = discordAccessToken.accessToken;
			if (!accessToken) throw new APIError("UNAUTHORIZED", { message: "No access token" });

			try {
				await checkDiscordAccess(accessToken);
			} catch (e) {
				if (e instanceof APIError && e.status === "FORBIDDEN") {
					await ctx.context.internalAdapter.deleteUser(ctx.context.newSession.user.id);
					ctx.context.internalAdapter.deleteSession(ctx.context.newSession.user.id);
					ctx.redirect("/auth/login?hasAccess=false");
				}

				throw e;
			}
		}),
	},
	plugins: [tanstackStartCookies()],
});
