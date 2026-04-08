import OAuth from "start-oauth";

import { createSession } from "~/api/auth.server";
import { db } from "~/api/db";

import { users } from "../../../../drizzle/schema";

export const GET = OAuth({
	password: process.env.SESSION_SECRET!,
	discord: {
		id: process.env.DISCORD_ID!,
		secret: process.env.DISCORD_SECRET!,
	},
	async handler({ email }, redirectTo) {
		const result = await db.query.users.findFirst({ where: (x, { eq }) => eq(x.email, email) });
		if (result) return createSession(result, redirectTo);

		const res = await db.insert(users).values({ email }).returning({ id: users.id });
		const { id } = res[0];

		return createSession({ id, email }, redirectTo);
	},
});
