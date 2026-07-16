import { createServerFn, createServerOnlyFn } from "@tanstack/react-start";
import { getRequestHeaders, setResponseStatus } from "@tanstack/react-start/server";
import { APIError } from "better-auth/api";

import { auth } from "@/auth";
import { env } from "@/env";

export const getSession = createServerFn({ method: "GET" }).handler(async () => {
	const headers = getRequestHeaders();
	const session = await auth.api.getSession({ headers });

	return session;
});

export const ensureSessionUtil = createServerOnlyFn(async () => {
	const headers = getRequestHeaders();
	const session = await auth.api.getSession({ headers });

	if (!session) {
		setResponseStatus(401);
		throw new Error("Unauthorized");
	}

	return { headers, session };
});

type DiscordGuildMember = {
	roles: string[];
};

export const checkDiscordAccess = createServerOnlyFn(async (token: string) => {
	const res = await fetch(
		`https://discord.com/api/users/@me/guilds/${env.DISCORD_GUILD_ID}/member`,
		{ headers: { Authorization: `Bearer ${token}` } },
	);

	if (!res.ok) {
		throw new APIError("FORBIDDEN", {
			message: "You must be a member of the required server.",
		});
	}

	const member: DiscordGuildMember = await res.json();

	if (!member.roles.some((role: string) => env.DISCORD_ROLE_IDS.includes(role))) {
		throw new APIError("FORBIDDEN", {
			message: "You don't have the required role.",
		});
	}
});
