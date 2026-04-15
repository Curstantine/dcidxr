import path from "node:path";

import { File as MegaFile } from "megajs";

import { readJsonFile, resolveInputPath, resolveOutputPath, writeJsonFile } from "./utils/files.ts";
import { dedupeByKey, mapWithConcurrency, normalizeNodeName } from "./utils/index.ts";
import type {
	FetchGroup,
	FetchInputPayload,
	FetchOutputPayload,
	Release,
	ReleaseFile,
} from "./utils/types.ts";

type MegaNode = {
	name: string | null;
	size?: number;
	directory: boolean;
	children?: MegaNode[];
};

type LinkTask = {
	groupIndex: number;
	circle: string;
	link: string;
};

type GroupAccumulator = {
	releaseSets: Release[][];
	errors: string[];
};

const AUDIO_FILE_EXTENSIONS = new Set([
	".aac",
	".aif",
	".aiff",
	".alac",
	".ape",
	".dsf",
	".flac",
	".m4a",
	".mp3",
	".ogg",
	".opus",
	".wav",
	".wma",
]);

const DEFAULT_CONCURRENCY = 4;
const MEGA_LOAD_MAX_ATTEMPTS = 3;
const MEGA_LOAD_RETRY_BASE_DELAY_MS = 750;
const MEGA_LOAD_RETRY_MAX_DELAY_MS = 5000;
const RETRYABLE_MEGA_ERROR_CODES = new Set([
	"ECONNABORTED",
	"ECONNRESET",
	"ENETDOWN",
	"ENETRESET",
	"ENETUNREACH",
	"EAI_AGAIN",
	"ETIMEDOUT",
]);
const RETRYABLE_MEGA_ERROR_MESSAGES = [
	"fetch failed",
	"network",
	"socket",
	"timeout",
	"timed out",
	"temporary failure",
	"connection reset",
];

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}

function formatError(error: unknown): string {
	if (error instanceof Error && error.message.trim().length > 0) {
		return error.message;
	}

	return String(error);
}

function getErrorCode(error: unknown): string | null {
	if (typeof error !== "object" || error === null) return null;

	const value = (error as { code?: unknown }).code;
	if (typeof value !== "string") return null;

	const normalized = value.trim().toUpperCase();
	return normalized.length > 0 ? normalized : null;
}

function isRetryableMegaLoadError(error: unknown): boolean {
	const code = getErrorCode(error);
	if (code && RETRYABLE_MEGA_ERROR_CODES.has(code)) {
		return true;
	}

	const message = formatError(error).toLowerCase();
	return RETRYABLE_MEGA_ERROR_MESSAGES.some((token) => message.includes(token));
}

function getRetryDelayMs(attempt: number): number {
	const exponentialDelay = Math.min(
		MEGA_LOAD_RETRY_MAX_DELAY_MS,
		MEGA_LOAD_RETRY_BASE_DELAY_MS * 2 ** (attempt - 1),
	);
	const jitter = Math.floor(Math.random() * 250);
	return Math.min(MEGA_LOAD_RETRY_MAX_DELAY_MS, exponentialDelay + jitter);
}

function isAudioFileName(name: string): boolean {
	const extension = path.extname(name).toLowerCase();
	return AUDIO_FILE_EXTENSIONS.has(extension);
}

function getDownloadId(node: MegaFile): string {
	return Array.isArray(node.downloadId)
		? node.downloadId[node.downloadId.length - 1]
		: node.downloadId;
}

function collectLeafFiles(node: MegaNode): ReleaseFile[] {
	const name = normalizeNodeName(node.name);

	if (!node.directory && isAudioFileName(name)) {
		const sizeBytes = typeof node.size === "number" ? node.size : 0;
		return [{ name, sizeBytes }];
	}

	if (node.children === undefined) return [];
	return node.children.flatMap((child) => collectLeafFiles(child));
}

function sumFileSizes(files: ReleaseFile[]): number {
	return files.reduce((total, file) => total + file.sizeBytes, 0);
}

async function buildRelease(node: MegaFile, rootLink: string): Promise<Release> {
	const name = normalizeNodeName(node.name);
	const files = node.directory
		? collectLeafFiles(node)
		: [{ name, sizeBytes: typeof node.size === "number" ? node.size : 0 }];

	const sizeBytes = sumFileSizes(files);
	const link = `${rootLink}/folder/${getDownloadId(node)}`;

	return {
		name,
		link,
		directory: node.directory,
		sizeBytes,
		files,
	};
}

async function loadMegaFolder(link: string): Promise<MegaFile> {
	let lastError: unknown = null;

	for (let attempt = 1; attempt <= MEGA_LOAD_MAX_ATTEMPTS; attempt += 1) {
		try {
			const root = MegaFile.fromURL(link);
			const loadedRoot = await root.loadAttributes();
			return loadedRoot as MegaFile;
		} catch (error: unknown) {
			lastError = error;
			const retryable = isRetryableMegaLoadError(error);
			const hasRemainingAttempts = attempt < MEGA_LOAD_MAX_ATTEMPTS;

			if (!retryable || !hasRemainingAttempts) {
				const reason = formatError(error);
				throw new Error(
					`Failed to load MEGA folder after ${attempt} attempt${attempt === 1 ? "" : "s"} (${link}): ${reason}`,
				);
			}

			const nextAttempt = attempt + 1;
			const delayMs = getRetryDelayMs(attempt);
			console.warn(
				`[retry ${nextAttempt}/${MEGA_LOAD_MAX_ATTEMPTS}] Retrying MEGA load in ${delayMs}ms: ${link} (${formatError(error)})`,
			);
			await sleep(delayMs);
		}
	}

	throw new Error(
		`Failed to load MEGA folder after ${MEGA_LOAD_MAX_ATTEMPTS} attempts (${link}): ${formatError(lastError)}`,
	);
}

async function fetchReleasesFromLink(link: string): Promise<Release[]> {
	const root = await loadMegaFolder(link);
	const name = normalizeNodeName(root.name, "Root");

	if (!root.directory) {
		return [await buildRelease(root, link)];
	}

	if (root.children === undefined || root.children.length === 0) {
		return [{ name, link, directory: true, sizeBytes: 0, files: [] }];
	}

	return Promise.all(root.children.map((child) => buildRelease(child, link)));
}

function dedupeReleases(releases: Release[]): Release[] {
	return dedupeByKey(
		releases,
		(release) => `${release.name}::${release.link}::${release.sizeBytes}`,
	);
}

export async function fetchReleases(inputArg?: string, outputArg?: string): Promise<void> {
	const inputPath = resolveInputPath(inputArg, "dist/transformed.json");
	const outputPath = resolveOutputPath(outputArg, "dist/releases.json");
	const inputJson = await readJsonFile<FetchInputPayload>(inputPath);

	if (!Array.isArray(inputJson.groups)) {
		throw new Error("Invalid input JSON: expected top-level 'groups' array.");
	}

	const groups = inputJson.groups;
	let processedLinkCount = 0;
	const totalLinks = groups.reduce((sum, group) => sum + group.links.length, 0);
	const linkTasks: LinkTask[] = groups.flatMap((group, groupIndex) =>
		group.links.map((link) => ({ groupIndex, circle: group.circle, link })),
	);

	const taskResults = await mapWithConcurrency(linkTasks, DEFAULT_CONCURRENCY, async (task) => {
		processedLinkCount += 1;
		console.log(`[${processedLinkCount}/${totalLinks}] Fetching ${task.circle}: ${task.link}`);

		try {
			return {
				groupIndex: task.groupIndex,
				releases: await fetchReleasesFromLink(task.link),
				error: null,
			};
		} catch (error: unknown) {
			const message = error instanceof Error ? error.message : String(error);
			return {
				groupIndex: task.groupIndex,
				releases: [],
				error: `${task.link}: ${message}`,
			};
		}
	});

	const groupAccumulators: GroupAccumulator[] = groups.map(() => ({
		releaseSets: [],
		errors: [],
	}));

	for (const result of taskResults) {
		const accumulator = groupAccumulators[result.groupIndex];
		accumulator.releaseSets.push(result.releases);
		if (result.error) {
			accumulator.errors.push(result.error);
		}
	}

	const outputGroups: FetchGroup[] = groups.map((group, groupIndex) => {
		const accumulator = groupAccumulators[groupIndex];
		const releases = dedupeReleases(accumulator.releaseSets.flat()).sort((a, b) =>
			a.name.localeCompare(b.name),
		);

		return {
			...group,
			releases,
			errors: accumulator.errors,
		};
	});

	const outputJson: FetchOutputPayload = { groups: outputGroups };
	await writeJsonFile(outputPath, outputJson);

	const totalReleases = outputGroups.reduce((sum, group) => sum + group.releases.length, 0);
	console.log(
		`Wrote ${outputGroups.length} groups, ${totalLinks} MEGA links, and ${totalReleases} releases to ${outputPath}`,
	);
}
