import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import z from "zod";

import { auth } from "@/auth";

export const getSession = createServerFn({ method: "GET" }).handler(async () => {
	const headers = getRequestHeaders();
	const session = await auth.api.getSession({ headers });

	return session;
});

export const ensureSession = createServerFn({ method: "GET" }).handler(async () => {
	const headers = getRequestHeaders();
	const session = await auth.api.getSession({ headers });

	if (!session) {
		throw new Error("Unauthorized");
	}

	return session;
});

export const getDiscordAccessToken = createServerFn({ method: "GET" }).handler(async () => {
	const headers = getRequestHeaders();
	const session = await auth.api.getSession({ headers });

	if (!session) {
		throw new Error("Unauthorized");
	}

	// Get the user's accounts to find Discord OAuth token
	const accounts = await auth.api.listUserAccounts({
		headers,
		query: { userId: session.user.id },
	});

	const discordAccount = accounts.find((account) => account.providerId === "discord");

	if (!discordAccount?.accessToken) {
		throw new Error("Discord account not linked");
	}

	return discordAccount.accessToken;
});

export const checkDiscordChannelAccess = createServerFn({ method: "GET" })
	.inputValidator(
		z.object({
			guildId: z.string(),
			channelId: z.string(),
		}),
	)
	.handler(async ({ data }) => {
		const accessToken = await getDiscordAccessToken();

		const guildsResponse = await fetch("https://discord.com/api/v10/users/@me/guilds", {
			headers: { Authorization: `Bearer ${accessToken}` },
		});

		if (!guildsResponse.ok) {
			throw new Error("Failed to fetch Discord guilds");
		}

		const guilds = await guildsResponse.json();
		console.log(guilds);

		const guild = guilds.find((g: any) => g.id === data.guildId);

		if (!guild) {
			return { hasAccess: false, reason: "Not a member of the guild" };
		}

		// Fetch guild member details for permissions
		const memberResponse = await fetch(
			`https://discord.com/api/v10/users/@me/guilds/${data.guildId}/member`,
			{
				headers: {
					Authorization: `Bearer ${accessToken}`,
				},
			},
		);

		if (!memberResponse.ok) {
			return { hasAccess: false, reason: "Failed to fetch member details" };
		}

		const member = await memberResponse.json();

		// Fetch channel to check permissions
		const channelResponse = await fetch(
			`https://discord.com/api/v10/channels/${data.channelId}`,
			{
				headers: {
					Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`,
				},
			},
		);

		if (!channelResponse.ok) {
			return { hasAccess: false, reason: "Channel not found or bot not in guild" };
		}

		const channel = await channelResponse.json();

		// Check if channel is in the correct guild
		if (channel.guild_id !== data.guildId) {
			return { hasAccess: false, reason: "Channel not in specified guild" };
		}

		// Basic permission check - you may need to implement more sophisticated logic
		// based on roles and channel-specific permissions
		return {
			hasAccess: true,
			guild,
			member,
			channel,
		};
	});

export const getDiscordGuilds = createServerFn({ method: "GET" }).handler(async () => {
	const accessToken = await getDiscordAccessToken();

	const response = await fetch("https://discord.com/api/v10/users/@me/guilds", {
		headers: {
			Authorization: `Bearer ${accessToken}`,
		},
	});

	if (!response.ok) {
		throw new Error("Failed to fetch Discord guilds");
	}

	return response.json();
});
