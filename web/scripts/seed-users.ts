import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { drizzle } from "drizzle-orm/neon-serverless";
import { config } from "dotenv";

import { relations } from "../src/db/relations.ts";
import * as schema from "../src/db/schema.ts";

config({ path: [".env.local", ".env"] });

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");

const db = drizzle(process.env.DATABASE_URL, { relations });

const auth = betterAuth({
	database: drizzleAdapter(db, { provider: "pg", schema }),
	emailAndPassword: {
		enabled: true,
		disableSignUp: false,
	},
});

const split = process.env.EMAIL_USERS?.split(";");
if (split === undefined || split?.length === 0 || split?.length % 2 !== 0)
	throw new Error("EMAIL_USERS is not set or invalid");

const users = split?.reduce(
	(acc, val, i, arr) => {
		if (i % 2 === 0) acc.push({ email: val, password: arr[i + 1] });
		return acc;
	},
	[] as { email: string; password: string }[],
);

console.log(`Found ${users.length} user(s) to process.`);

for (const { email, password } of users) {
	const name = email.split("@")[0];
	try {
		const result = await auth.api.signUpEmail({
			body: { email, password, name },
			headers: new Headers(),
		});

		console.log(`Created user ${email} (id: ${result.user.id}).`);
	} catch (e) {
		if (e instanceof Error && e.message.toLowerCase().includes("already exists")) {
			console.log(`Skipping ${email} — already exists.`);
			continue;
		}
		throw e;
	}
}

process.exit(0);
