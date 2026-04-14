import { eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";

import { relations } from "../../web/src/db/relations.ts";
import { circle, release, serverMeta } from "../../web/src/db/schema.ts";
import { readJsonFile, resolveInputPath } from "./utils/files.ts";
import { dedupeByKey, mapWithConcurrency, normalizeString } from "./utils/index.ts";
import type { DbCircleStatus, FetchGroup, SyncInputPayload } from "./utils/types.ts";

import "./utils/prelude.ts";

if (!process.env.DATABASE_URL) {
	throw new Error("[drizzle]: DATABASE_URL is not set");
}

const db = drizzle(process.env.DATABASE_URL, { relations });
const DEFAULT_CONCURRENCY = 8;

function normalizeStatus(status: string | null | undefined): DbCircleStatus {
	switch (status) {
		case "missing":
			return "missing";
		case "complete":
		case "completed":
			return "complete";
		case "incomplete":
			return "incomplete";
		default:
			return "incomplete";
	}
}

function buildStatusText(group: FetchGroup, mappedStatus: DbCircleStatus): string {
	const sourceStatus = normalizeString(group.status);
	const statusMeta = normalizeString(group.statusMeta);

	const parts = [sourceStatus, statusMeta ? `[${statusMeta}]` : null].filter(
		(value): value is string => value !== null,
	);

	if (parts.length > 0) {
		return parts.join(" - ");
	}

	switch (mappedStatus) {
		case "complete":
			return "Completed";
		case "missing":
			return "Missing releases";
		default:
			return "Incomplete";
	}
}

function bytesToMegabytes(sizeBytes: number): number {
	if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
		return 0;
	}

	return Math.max(1, Math.ceil(sizeBytes / (1024 * 1024)));
}

function normalizeGroup(group: FetchGroup): FetchGroup {
	const circleName = normalizeString(group.circle);
	if (!circleName) {
		throw new Error("Invalid group: expected non-empty 'circle' name.");
	}

	const uniqueLinks = Array.isArray(group.links)
		? dedupeByKey(
				group.links
					.map((link) => normalizeString(link))
					.filter((link): link is string => link !== null),
				(link) => link,
			)
		: [];

	const releases = Array.isArray(group.releases)
		? dedupeByKey(group.releases, (item) => `${item.name}::${item.link}::${item.sizeBytes}`)
		: [];

	return {
		...group,
		circle: circleName,
		links: uniqueLinks,
		missingLink: normalizeString(group.missingLink),
		status: normalizeString(group.status),
		statusMeta: normalizeString(group.statusMeta),
		releases,
		errors: Array.isArray(group.errors) ? group.errors : [],
	};
}

export async function sync(inputArg?: string): Promise<void> {
	const inputPath = resolveInputPath(inputArg, "dist/releases.json");
	const inputJson = await readJsonFile<SyncInputPayload>(inputPath);

	if (!Array.isArray(inputJson.groups)) {
		throw new Error("Invalid input JSON: expected top-level 'groups' array.");
	}

	const groups = inputJson.groups.map(normalizeGroup);
	const circleNames = dedupeByKey(
		groups.map((x) => x.circle),
		(y) => y,
	);

	if (circleNames.length === 0) {
		console.log("No groups found. Nothing to sync.");
		return;
	}

	const existingCircles = await db
		.select({ id: circle.id, name: circle.name })
		.from(circle)
		.where(inArray(circle.name, circleNames));

	const circleIdsByName = new Map<string, number>();

	for (const existingCircle of existingCircles) {
		if (circleIdsByName.has(existingCircle.name)) {
			throw new Error(
				`Duplicate circle rows found in database for name: ${existingCircle.name}`,
			);
		}

		circleIdsByName.set(existingCircle.name, existingCircle.id);
	}

	const missingCircleNames = circleNames.filter((name) => !circleIdsByName.has(name));

	if (missingCircleNames.length > 0) {
		const insertedCircles = await db
			.insert(circle)
			.values(
				missingCircleNames.map((name) => ({
					name,
					megaLinks: [],
					status: "incomplete" as const,
					statusText: "Incomplete",
					missingLink: null,
				})),
			)
			.returning({
				id: circle.id,
				name: circle.name,
			});

		insertedCircles.forEach((x) => {
			circleIdsByName.set(x.name, x.id);
		});
	}

	let startedCircles = 0;
	const totalCircles = groups.length;

	const syncResults = await mapWithConcurrency(groups, DEFAULT_CONCURRENCY, async (group) => {
		startedCircles += 1;
		console.log(
			`[${startedCircles}/${totalCircles}] Syncing ${group.circle} (${group.releases.length} releases)`,
		);

		const circleId = circleIdsByName.get(group.circle);

		if (!circleId) {
			throw new Error(`Failed to resolve database circle id for: ${group.circle}`);
		}

		const mappedStatus = normalizeStatus(group.status);
		const statusText = buildStatusText(group, mappedStatus);

		const opCounts = await db.transaction(async (tx) => {
			await tx
				.update(circle)
				.set({
					name: group.circle,
					megaLinks: group.links,
					status: mappedStatus,
					statusText,
					missingLink: group.missingLink ?? null,
				})
				.where(eq(circle.id, circleId));

			// Fetch existing releases for this circle
			const existingReleases = await tx
				.select()
				.from(release)
				.where(eq(release.circleId, circleId));

			// Create a map of existing releases by megaLink for quick lookup
			const existingByLink = new Map(existingReleases.map((r) => [r.megaLink, r]));

			// Create a set of incoming release links
			const incomingLinks = new Set(group.releases.map((r) => r.link));

			// Determine what to delete (exists in DB but not in incoming)
			const toDelete = existingReleases
				.filter((r) => !incomingLinks.has(r.megaLink))
				.map((r) => r.id);

			// Determine what to insert or update
			const toInsert = [];
			const toUpdate = [];

			for (const item of group.releases) {
				const existing = existingByLink.get(item.link);
				const sizeMb = bytesToMegabytes(item.sizeBytes);

				if (!existing) {
					// New release
					toInsert.push({
						name: item.name,
						sizeMb,
						megaLink: item.link,
						circleId,
					});
				} else if (existing.name !== item.name || existing.sizeMb !== sizeMb) {
					// Existing release with changes
					toUpdate.push({
						id: existing.id,
						name: item.name,
						sizeMb,
					});
				}
			}

			// Perform deletions
			if (toDelete.length > 0) {
				await tx.delete(release).where(inArray(release.id, toDelete));
			}

			// Perform insertions
			if (toInsert.length > 0) {
				await tx.insert(release).values(toInsert);
			}

			// Perform updates
			for (const update of toUpdate) {
				await tx
					.update(release)
					.set({ name: update.name, sizeMb: update.sizeMb })
					.where(eq(release.id, update.id));
			}

			return {
				insertCount: toInsert.length,
				updateCount: toUpdate.length,
				deleteCount: toDelete.length,
			};
		});

		return {
			releaseCount: group.releases.length,
			errorCount: group.errors.length,
			insertCount: opCounts.insertCount,
			updateCount: opCounts.updateCount,
			deleteCount: opCounts.deleteCount,
		};
	});

	const syncedCircles = syncResults.length;
	const syncedReleases = syncResults.reduce((total, result) => total + result.releaseCount, 0);
	const totalErrors = syncResults.reduce((total, result) => total + result.errorCount, 0);
	const totalInserts = syncResults.reduce((total, result) => total + result.insertCount, 0);
	const totalUpdates = syncResults.reduce((total, result) => total + result.updateCount, 0);
	const totalDeletes = syncResults.reduce((total, result) => total + result.deleteCount, 0);

	await db
		.insert(serverMeta)
		.values({ key: "last_indexed", value: new Date().toISOString() })
		.onConflictDoUpdate({
			target: serverMeta.key,
			set: { value: new Date().toISOString() },
		});

	console.log(`Synced ${syncedCircles} circles and ${syncedReleases} releases from ${inputPath}`);
	console.log(
		`  Operations: ${totalInserts} inserted, ${totalUpdates} updated, ${totalDeletes} deleted${totalErrors > 0 ? ` (${totalErrors} fetch errors recorded in source JSON)` : ""}`,
	);
}
