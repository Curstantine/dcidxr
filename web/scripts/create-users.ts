import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { hashPassword } from "better-auth/crypto";

import { relations } from "../src/db/relations.ts";
import { user, account } from "../src/db/schema.ts";
import { config } from "dotenv";

config({ path: [".env.local", ".env"] });

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
const db = drizzle(process.env.DATABASE_URL, { relations });

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
	const existing = await db
		.select({ id: user.id })
		.from(user)
		.where(eq(user.email, email))
		.limit(1);

	if (existing.length > 0) {
		console.log(`Skipping ${email} — already exists (id: ${existing[0].id}).`);
		continue;
	}

	const hashedPassword = await hashPassword(password);
	const userId = crypto.randomUUID();
	const accountId = crypto.randomUUID();

	await db.insert(user).values({
		id: userId,
		name: email.split("@")[0],
		email,
		emailVerified: true,
	});

	await db.insert(account).values({
		id: accountId,
		accountId: email,
		providerId: "email",
		userId,
		password: hashedPassword,
	});

	console.log(`Created user ${email} (id: ${userId}).`);
}

process.exit(0);
