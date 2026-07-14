import { eq, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-serverless";
import { Pool } from "@neondatabase/serverless";

import "./utils/prelude.ts";
import { bToMB, chunkIter, dedupeByKey, mapWithConcurrency } from "./utils/index.ts";
import { readJsonFile, resolveInputPath } from "./utils/files.ts";
import { type FetchGroup, type SyncInputPayload } from "./utils/types.ts";
import { buildStatusText, normalizeStatus, normalizeString } from "./utils/strings.ts";

import { relations } from "../../web/src/db/relations.ts";
import { circle, release, serverMeta, track } from "../../web/src/db/schema.ts";

if (!process.env.DATABASE_URL) {
	throw new Error("[drizzle]: DATABASE_URL is not set");
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
const db = drizzle({ client: pool, relations });

const SYNC_CONCURRENCY = 5;
const CHUNK_SIZE = 40;
const CIRCLE_TX_CHUNK_SIZE = 2;

async function wakeupDatabase(retries = 3) {
	for (let i = 0; i < retries; i++) {
		try {
			console.log("Checking database connection (waking up if asleep)...");
			await db.execute(sql`SELECT 1`);
			console.log("Database is awake and ready!");
			return;
		} catch {
			console.warn(
				`Connection failed (Attempt ${i + 1}/${retries}). Retrying in 2 seconds...`,
			);
			await new Promise((res) => setTimeout(res, 2000));
		}
	}
	throw new Error("Failed to wake up the database after multiple attempts.");
}

export async function sync(inputArg?: string): Promise<void> {
	await wakeupDatabase();
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
	let processedCount = 0;

	const circleChunks = Array.from(chunkIter(circles, CIRCLE_TX_CHUNK_SIZE));

	await mapWithConcurrency(circleChunks, SYNC_CONCURRENCY, async (circleChunk) => {
		await db.transaction(async (tx) => {
			for (const circle of circleChunk) {
				const id = circleIdByName.get(circle.circle);
				if (id === undefined) throw new Error(`Couldn't find id for ${circle.circle}`);

				let existing;
				try {
					existing = await tx.select().from(release).where(eq(release.circleId, id));
				} catch (e) {
					console.error(
						`[sync]: Failed to fetch existing releases for circle ${circle.circle}:`,
						e,
					);
					throw e;
				}

				const existingLinks = new Map(existing.map((x) => [x.megaLink, x]));
				const incoming = new Set(circle.releases.map((x) => x.link));

				// 1. Bulk Delete Old Releases
				const toDelete = existing.filter((x) => !incoming.has(x.megaLink)).map((r) => r.id);
				if (toDelete.length > 0) {
					dCount += toDelete.length;
					for (const chunk of chunkIter(toDelete, CHUNK_SIZE)) {
						try {
							await tx.delete(release).where(inArray(release.id, chunk));
						} catch (e) {
							console.error(
								`[sync]: Failed to delete old releases for circle ${circle.circle}:`,
								e,
							);
							throw e;
						}
					}
				}

				const releasesToInsert = [];
				const releasesToUpdate = [];
				const tracksToInsert = [];
				const releaseIdsToClearTracks = [];

				// 2. Categorize operations in memory
				for (const item of circle.releases) {
					const current = existingLinks.get(item.link);
					const sizeMb = bToMB(item.sizeBytes);

					if (!current) {
						releasesToInsert.push({ ...item, sizeMb });
					} else {
						if (current.name !== item.name || current.sizeMb !== sizeMb) {
							uCount += 1;
							releasesToUpdate.push({ id: current.id, name: item.name, sizeMb });
						}

						releaseIdsToClearTracks.push(current.id);

						if (item.files.length > 0) {
							iCount += item.files.length;
							tracksToInsert.push(
								...item.files.map((f) => ({
									name: f.name,
									circleId: id,
									releaseId: current.id,
								})),
							);
						}
					}
				}

				// 3. Execute Updates
				for (const updateItem of releasesToUpdate) {
					try {
						await tx
							.update(release)
							.set({ name: updateItem.name, sizeMb: updateItem.sizeMb })
							.where(eq(release.id, updateItem.id));
					} catch (e) {
						console.error(
							`[sync]: Failed to update release ${updateItem.name} for circle ${circle.circle}:`,
							e,
						);
						throw e;
					}
				}

				// 4. Clear old tracks in bulk
				if (releaseIdsToClearTracks.length > 0) {
					for (const chunk of chunkIter(releaseIdsToClearTracks, CHUNK_SIZE)) {
						try {
							await tx.delete(track).where(inArray(track.releaseId, chunk));
						} catch (e) {
							console.error(
								`[sync]: Failed to clear old tracks for circle ${circle.circle}:`,
								e,
							);
							throw e;
						}
					}
				}

				// 5. Bulk Insert New Releases & Map IDs to Tracks
				if (releasesToInsert.length > 0) {
					for (const chunk of chunkIter(releasesToInsert, CHUNK_SIZE)) {
						const dbPayload = chunk.map((r) => ({
							circleId: id,
							name: r.name,
							megaLink: r.link,
							sizeMb: r.sizeMb,
						}));

						let inserted;
						try {
							inserted = await tx
								.insert(release)
								.values(dbPayload)
								.returning({ id: release.id, megaLink: release.megaLink });
						} catch (e) {
							console.error(
								`[sync]: Failed to insert new releases chunk for circle ${circle.circle}:`,
								e,
							);
							throw e;
						}

						iCount += inserted.length;
						const idMap = new Map(inserted.map((i) => [i.megaLink, i.id]));

						for (const r of chunk) {
							const rId = idMap.get(r.link);
							if (rId && r.files.length > 0) {
								iCount += r.files.length;
								tracksToInsert.push(
									...r.files.map((f) => ({
										name: f.name,
										circleId: id,
										releaseId: rId,
									})),
								);
							}
						}
					}
				}

				// 6. Bulk Insert All Tracks (For both New and Existing Releases)
				if (tracksToInsert.length > 0) {
					for (const chunk of chunkIter(tracksToInsert, 50)) {
						try {
							await tx.insert(track).values(chunk);
						} catch (e) {
							console.error(
								`[sync]: Failed to insert tracks chunk for circle ${circle.circle}:`,
								e,
							);
							throw e;
						}
					}
				}

				processedCount += 1;
				console.log(`[${processedCount}/${circles.length}] Synchronized ${circle.circle}`);
			}
		});
	});

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
