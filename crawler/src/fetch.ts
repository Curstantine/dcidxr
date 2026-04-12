import { promises as fs } from "node:fs";
import path from "node:path";

import { File as MegaFile } from "megajs";

type GroupInput = {
	circle: string;
	links: string[];
	missingLinks?: string[];
	status?: string | null;
	statusMeta?: string | null;
	lastUpdated?: string | null;
};

type InputPayload = {
	groups?: GroupInput[];
};

type ReleaseFile = {
	name: string;
	sizeBytes: number;
};

type Release = {
	name: string;
	link: string;
	directory: boolean;
	sizeBytes: number;
	files: ReleaseFile[];
};

type GroupOutput = GroupInput & {
	releases: Release[];
	errors: string[];
};

type OutputPayload = {
	groups: GroupOutput[];
};

type MegaNode = {
	name: string | null;
	size?: number;
	directory: boolean;
	children?: MegaNode[];
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

type LinkTask = {
	groupIndex: number;
	circle: string;
	link: string;
};

type GroupAccumulator = {
	releaseSets: Release[][];
	errors: string[];
};

function parseJson<T>(raw: string, filePath: string): T {
	try {
		return JSON.parse(raw) as T;
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		throw new Error(`Invalid JSON in ${filePath}: ${message}`);
	}
}

function normalizeNodeName(name: string | null | undefined, fallback = "Unknown"): string {
	const normalized = typeof name === "string" ? name.trim() : "";
	return normalized.length > 0 ? normalized : fallback;
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
	return node.children.flatMap((x) => collectLeafFiles(x));
}

function sumFileSizes(files: ReleaseFile[]): number {
	return files.reduce((total, file) => total + file.sizeBytes, 0);
}

async function buildRelease(node: MegaFile): Promise<Release> {
	const name = normalizeNodeName(node.name);
	const files = node.directory
		? collectLeafFiles(node)
		: [{ name, sizeBytes: typeof node.size === "number" ? node.size : 0 }];

	const sizeBytes = sumFileSizes(files);
	const link = await node.link(false);

	return {
		name,
		link,
		directory: node.directory,
		sizeBytes,
		files,
	};
}

async function loadMegaFolder(link: string): Promise<MegaFile> {
	const root = MegaFile.fromURL(link);
	return root.loadAttributes();
}

async function fetchReleasesFromLink(link: string): Promise<Release[]> {
	const root = await loadMegaFolder(link);
	const name = normalizeNodeName(root.name, "Root");

	if (!root.directory) {
		return [await buildRelease(root)];
	}

	if (root.children === undefined || root.children.length === 0) {
		return [{ name, link: await root.link(false), directory: true, sizeBytes: 0, files: [] }];
	}

	return Promise.all(root.children.map(buildRelease));
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

function dedupeReleases(releases: Release[]): Release[] {
	const seen = new Set<string>();
	const deduped: Release[] = [];

	for (const release of releases) {
		const key = `${release.name}::${release.link}::${release.sizeBytes}`;
		if (seen.has(key)) continue;

		seen.add(key);
		deduped.push(release);
	}

	return deduped;
}

export async function fetchReleases(inputArg?: string, outputArg?: string): Promise<void> {
	const inputPath = path.resolve(process.cwd(), inputArg ?? "dist/transformed.json");
	const outputPath = path.resolve(process.cwd(), outputArg ?? "dist/releases.json");

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

	const outputGroups = groups.map((group, groupIndex) => {
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

	const outputJson: OutputPayload = { groups: outputGroups };
	await fs.writeFile(outputPath, `${JSON.stringify(outputJson, null, 2)}\n`);

	const totalReleases = outputGroups.reduce((sum, group) => sum + group.releases.length, 0);
	console.log(
		`Wrote ${outputGroups.length} groups, ${totalLinks} MEGA links, and ${totalReleases} releases to ${outputPath}`,
	);
}
