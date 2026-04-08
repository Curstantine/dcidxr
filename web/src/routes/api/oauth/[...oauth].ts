import OAuth from "start-oauth";

import { createSession } from "~/api/auth.server";
import { db } from "~/api/db";

import { user } from "../../../../drizzle/schema";

export const GET = OAuth({
	password: process.env.SESSION_SECRET!,
	discord: {
		id: process.env.DISCORD_ID!,
		secret: process.env.DISCORD_SECRET!,
	},
	async handler({ email }, redirectTo) {
		const result = await db.query.user.findFirst({ where: { email: email } });
		if (result) return createSession(result, redirectTo);

		const res = await db.insert(user).values({ email }).returning({ id: user.id });
		const { id } = res[0];

		return createSession({ id, email }, redirectTo);
	},
});
