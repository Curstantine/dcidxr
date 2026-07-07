import { eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";

import "./utils/prelude.ts";
import { bToMB, chunkIter, dedupeByKey } from "./utils/index.ts";
import { readJsonFile, resolveInputPath } from "./utils/files.ts";
import { type FetchGroup, type SyncInputPayload } from "./utils/types.ts";
import { buildStatusText, normalizeStatus, normalizeString } from "./utils/strings.ts";

import { relations } from "../../web/src/db/relations.ts";
import { circle, release, serverMeta } from "../../web/src/db/schema.ts";

if (!process.env.TURSO_DATABASE_URL) {
	throw new Error("[drizzle]: TURSO_DATABASE_URL is not set");
}

if (!process.env.TURSO_AUTH_TOKEN) {
	throw new Error("[drizzle]: TURSO_AUTH_TOKEN is not set");
}

const client = createClient({
	url: process.env.TURSO_DATABASE_URL,
	authToken: process.env.TURSO_AUTH_TOKEN,
});

const db = drizzle({ client, relations });

const CHUNK_SIZE = 100;

export async function sync(inputArg?: string): Promise<void> {
	const path = resolveInputPath(inputArg, "dist/releases.json");
	const input = await readJsonFile<SyncInputPayload>(path);

	if (!Array.isArray(input.groups)) {
		throw new Error("Invalid input JSON: expected top-level 'groups' array.");
	}

	const circles = input.groups.map(normalizeCircle);
	if (circles.length === 0) {
		console.warn("No groups found. Nothing to sync.");
		return;
	}

	const circleIdByName = new Map<string, number>();

	try {
		const names = circles.map((x) => x.circle);
		for (const chunk of chunkIter(names, CHUNK_SIZE)) {
			const existing = await db
				.select({ id: circle.id, name: circle.name })
				.from(circle)
				.where(inArray(circle.name, chunk));

			existing.forEach((x) => circleIdByName.set(x.name, x.id));
		}
	} catch (e) {
		console.error("Failed to fetch circles: ", e);
		return;
	}

	try {
		const missing = circles
			.filter((x) => !circleIdByName.has(x.circle))
			.map(fetchGroupToCircleInsert);

		console.log("Inserting", missing.length, "missing circles...");

		for (const chunk of chunkIter(missing, CHUNK_SIZE)) {
			const insert = await db
				.insert(circle)
				.values(chunk)
				.returning({ id: circle.id, name: circle.name });

			insert.forEach((x) => circleIdByName.set(x.name, x.id));
		}
	} catch (e) {
		console.error("Failed to insert missing circles: ", e);
		return;
	}

	let dCount = 0,
		iCount = 0,
		uCount = 0;

	for (const chunk of chunkIter(circles, Math.floor(CHUNK_SIZE / 2))) {
		await db.transaction(async (tx) => {
			for (let i = 0; i < chunk.length; i++) {
				const circle = chunk[i];
				console.log(`[${i + 1}/${chunk.length}]`, "Synchronizing", circle.circle);

				const id = circleIdByName.get(circle.circle);
				if (id === undefined) throw new Error(`Couldn't find id for ${circle.circle}`);

				const existing = await tx.select().from(release).where(eq(release.circleId, id));
				const existingLinks = new Map(existing.map((x) => [x.megaLink, x]));
				const incoming = new Set(circle.releases.map((x) => x.link));

				const toDelete = existing.filter((x) => !incoming.has(x.megaLink)).map((r) => r.id);
				const toInsert: (typeof release.$inferInsert)[] = [];
				const toUpdate: (Partial<typeof release.$inferInsert> &
					Pick<typeof release.$inferSelect, "id">)[] = [];

				for (const item of circle.releases) {
					const existing = existingLinks.get(item.link);
					const sizeMb = bToMB(item.sizeBytes);

					if (!existing) {
						toInsert.push({
							circleId: id,
							name: item.name,
							megaLink: item.link,
							sizeMb,
						});
					} else if (existing.name !== item.name || existing.sizeMb !== sizeMb) {
						toUpdate.push({ id: existing.id, name: item.name, sizeMb });
					}
				}

				if (toDelete.length > 0) {
					dCount += toDelete.length;
					await tx.delete(release).where(inArray(release.id, toDelete));
				}

				if (toInsert.length > 0) {
					iCount += toInsert.length;
					await tx.insert(release).values(toInsert);
				}

				uCount += toUpdate.length;
				for (const update of toUpdate) {
					await tx
						.update(release)
						.set({ name: update.name, sizeMb: update.sizeMb })
						.where(eq(release.id, update.id));
				}
			}
		});
		console.log("---------- CHUNK OVER ----------\n");
	}

	const rn = new Date().toISOString();
	await db
		.insert(serverMeta)
		.values({ key: "last_indexed", value: rn })
		.onConflictDoUpdate({ target: serverMeta.key, set: { value: rn } });

	const circleCount = circles.length;
	const { errCount, releaseCount } = circles.reduce(
		(t, r) => {
			t.releaseCount += r.releases.length;
			t.errCount += r.errors.length;
			return t;
		},
		{ errCount: 0, releaseCount: 0 },
	);

	console.log(
		`Synchronized ${circleCount} circles, ${releaseCount} releases, and found ${errCount} errors.\n`,
		`  - insertions: ${iCount}\n`,
		`  - updates: ${uCount}\n`,
		`  - deletions: ${dCount}`,
	);
}

const fetchGroupToCircleInsert = (x: FetchGroup): typeof circle.$inferInsert => {
	const status = normalizeStatus(x.status);
	return {
		name: x.circle,
		megaLinks: x.links,
		status,
		missingLink: x.missingLink,
		statusText: buildStatusText(x, status),
	};
};

const normalizeCircle = (c: FetchGroup): FetchGroup => {
	const circle = normalizeString(c.circle);
	if (!circle) throw new Error("Invalid group: expected non-empty 'circle' name.");

	const links = dedupeByKey(
		c.links.map(normalizeString).filter((x) => x !== null),
		(l) => l,
	);
	const releases = dedupeByKey(c.releases, (x) => `${x.name}::${x.link}`);

	return {
		...c,
		circle,
		links,
		missingLink: normalizeString(c.missingLink),
		status: normalizeString(c.status),
		statusMeta: normalizeString(c.statusMeta),
		releases,
		errors: Array.isArray(c.errors) ? c.errors : [],
	};
};
