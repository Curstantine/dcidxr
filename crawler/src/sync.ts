import { promises as fs } from "node:fs";
import path from "node:path";

import { config } from "dotenv";
import { eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";

import { relations } from "../../web/src/db/relations.ts";
import { circle, release, serverMeta } from "../../web/src/db/schema.ts";

config({ path: [".env.local", ".env"] });

if (!process.env.DATABASE_URL) {
	throw new Error("[drizzle]: DATABASE_URL is not set");
}

const db = drizzle(process.env.DATABASE_URL, { relations });

type InputReleaseFile = {
	name: string;
	sizeBytes: number;
};

type InputRelease = {
	name: string;
	link: string;
	directory: boolean;
	sizeBytes: number;
	files: InputReleaseFile[];
};

type InputGroup = {
	circle: string;
	links: string[];
	missingLink?: string | null;
	status?: string | null;
	statusMeta?: string | null;
	lastUpdated?: string | null;
	releases: InputRelease[];
	errors?: string[];
};

type InputPayload = {
	groups?: InputGroup[];
};

type DbCircleStatus = "missing" | "incomplete" | "complete";

function parseJson<T>(raw: string, filePath: string): T {
	try {
		return JSON.parse(raw) as T;
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		throw new Error(`Invalid JSON in ${filePath}: ${message}`);
	}
}

function normalizeString(value: string | null | undefined): string | null {
	if (typeof value !== "string") return null;

	const normalized = value.trim();
	return normalized.length > 0 ? normalized : null;
}

function normalizeStatus(status: string | null | undefined): DbCircleStatus {
	const normalized = normalizeString(status)?.toLowerCase() ?? "";

	if (normalized.startsWith("complete")) {
		return "complete";
	}

	if (normalized.startsWith("missing")) {
		return "missing";
	}

	return "incomplete";
}

function buildStatusText(group: InputGroup, mappedStatus: DbCircleStatus): string {
	const sourceStatus = normalizeString(group.status);
	const statusMeta = normalizeString(group.statusMeta);
	const lastUpdated = normalizeString(group.lastUpdated);

	const parts = [
		sourceStatus,
		statusMeta ? `[${statusMeta}]` : null,
		lastUpdated ? `Updated: ${lastUpdated}` : null,
	].filter((value): value is string => value !== null);

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

function dedupeReleases(releases: InputRelease[]): InputRelease[] {
	const seen = new Set<string>();
	const deduped: InputRelease[] = [];

	for (const item of releases) {
		const key = `${item.name}::${item.link}::${item.sizeBytes}`;
		if (seen.has(key)) continue;

		seen.add(key);
		deduped.push(item);
	}

	return deduped;
}

async function mapWithConcurrency<TInput, TOutput>(
	values: TInput[],
	concurrency: number,
	mapper: (value: TInput, index: number) => Promise<TOutput>,
): Promise<TOutput[]> {
	if (values.length === 0) return [];

	const results: TOutput[] = Array.from(
		{ length: values.length },
		() => null as unknown as TOutput,
	);
	let nextIndex = 0;

	const worker = async (): Promise<void> => {
		while (nextIndex < values.length) {
			const currentIndex = nextIndex;
			nextIndex += 1;
			results[currentIndex] = await mapper(values[currentIndex], currentIndex);
		}
	};

	const workerCount = Math.max(1, Math.min(concurrency, values.length));
	await Promise.all(Array.from({ length: workerCount }, () => worker()));
	return results;
}

function normalizeGroup(group: InputGroup): InputGroup {
	const circleName = normalizeString(group.circle);
	if (!circleName) {
		throw new Error("Invalid group: expected non-empty 'circle' name.");
	}

	const uniqueLinks = Array.isArray(group.links)
		? [
				...new Set(
					group.links
						.map(normalizeString)
						.filter((link): link is string => link !== null),
				),
			]
		: [];

	const releases = Array.isArray(group.releases) ? dedupeReleases(group.releases) : [];

	return {
		...group,
		circle: circleName,
		links: uniqueLinks,
		missingLink: normalizeString(group.missingLink),
		status: normalizeString(group.status),
		statusMeta: normalizeString(group.statusMeta),
		lastUpdated: normalizeString(group.lastUpdated),
		releases,
		errors: Array.isArray(group.errors) ? group.errors : [],
	};
}

export async function sync(inputArg?: string): Promise<void> {
	const inputPath = path.resolve(process.cwd(), inputArg ?? "dist/releases.json");
	const DEFAULT_CONCURRENCY = 8;

	try {
		await fs.access(inputPath);
	} catch {
		throw new Error(`Input file not found: ${inputPath}`);
	}

	const inputRaw = await fs.readFile(inputPath, "utf8");
	const inputJson = parseJson<InputPayload>(inputRaw, inputPath);

	if (!Array.isArray(inputJson.groups)) {
		throw new Error("Invalid input JSON: expected top-level 'groups' array.");
	}

	const groups = inputJson.groups.map(normalizeGroup);
	const circleNames = [...new Set(groups.map((group) => group.circle))];

	if (circleNames.length === 0) {
		console.log("No groups found. Nothing to sync.");
		return;
	}

	const existingCircles = await db
		.select({
			id: circle.id,
			name: circle.name,
		})
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
					lastUpdated: null,
				})),
			)
			.returning({
				id: circle.id,
				name: circle.name,
			});

		for (const insertedCircle of insertedCircles) {
			circleIdsByName.set(insertedCircle.name, insertedCircle.id);
		}
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

		await db.transaction(async (tx) => {
			await tx
				.update(circle)
				.set({
					name: group.circle,
					megaLinks: group.links,
					status: mappedStatus,
					statusText,
					missingLink: group.missingLink ?? null,
					lastUpdated: group.lastUpdated ?? null,
				})
				.where(eq(circle.id, circleId));

			await tx.delete(release).where(eq(release.circleId, circleId));

			if (group.releases.length > 0) {
				await tx.insert(release).values(
					group.releases.map((item) => ({
						name: item.name,
						sizeMb: bytesToMegabytes(item.sizeBytes),
						megaLink: item.link,
						circleId,
					})),
				);
			}
		});

		return {
			releaseCount: group.releases.length,
			errorCount: group.errors?.length ?? 0,
		};
	});

	const syncedCircles = syncResults.length;
	const syncedReleases = syncResults.reduce((total, result) => total + result.releaseCount, 0);
	const totalErrors = syncResults.reduce((total, result) => total + result.errorCount, 0);

	await db
		.update(serverMeta)
		.set({ value: new Date().toISOString() })
		.where(eq(serverMeta.key, "last_crawled"));

	console.log(
		`Synced ${syncedCircles} circles and ${syncedReleases} releases from ${inputPath}${totalErrors > 0 ? ` (${totalErrors} fetch errors recorded in source JSON)` : ""}`,
	);
}
