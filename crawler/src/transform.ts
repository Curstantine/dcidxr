import {
	assertFileExists,
	readJsonFile,
	resolveInputPath,
	resolveOutputPath,
	writeJsonFile,
} from "./utils/files.ts";
import type {
	GroupBase,
	Message,
	TransformInputPayload,
	TransformOutputPayload,
} from "./utils/types.ts";

const MEGA_LINK_REGEX = /https?:\/\/(?:www\.)?mega\.(?:nz|co\.nz)\/[^\s)>]+/gi;
const URL_REGEX = /https?:\/\/[^\s)>]+/gi;
const CIRCLE_REGEX = /^\s*\*\*(.+?)\*\*(?:\s+.*)?$/;
const STATUS_LINE_REGEX = /^\s*Stat(?:us|s)(?:\s*\([^)]*\))?\s*:\s*(.+)$/i;
const MISSING_LINE_REGEX = /^\s*Missing(?:\s*\([^)]*\))?\s*:/i;
const STATUS_UPDATE_REGEX = /-\s*(?:Last\s+)?Updat\w*\s*:?\s*(.+)$/i;
const TRAILING_DATE_REGEX = /-\s*(\d{1,2}\/\d{1,2}\/\d{2,4})\s*$/;

type MutableGroup = {
	links: Set<string>;
	missingLink: string | null;
	status: string | null;
	statusMeta: string | null;
	lastUpdated: string | null;
};

function normalizeCircleName(rawName: string): string {
	return rawName.trim();
}

function normalizeStatus(rawStatus: string): string | null {
	const normalized = rawStatus
		.replace(/^[:\-\s]+/, "")
		.replace(/\s+/g, " ")
		.trim();

	if (normalized.length === 0) {
		return null;
	}

	const compact = normalized.toLowerCase().replace(/[^a-z]/g, "");

	if (compact.startsWith("incomplete") || compact.startsWith("incompleted")) {
		return "incomplete";
	}

	if (compact.startsWith("missing")) {
		return "missing";
	}

	if (
		compact.startsWith("completed") ||
		compact.startsWith("complete") ||
		compact.endsWith("completed") ||
		compact.startsWith("compelted")
	) {
		return "completed";
	}

	return normalized;
}

function parseStatusLine(line: string): {
	status: string | null;
	statusMeta: string | null;
	lastUpdated: string | null;
} | null {
	const match = line.match(STATUS_LINE_REGEX);
	if (!match) {
		return null;
	}

	const value = match[1].trim();
	const updatedMatch = value.match(STATUS_UPDATE_REGEX) ?? value.match(TRAILING_DATE_REGEX);
	const lastUpdated = updatedMatch?.[1].trim() ?? null;

	const withoutUpdate = updatedMatch
		? value.slice(0, Math.max(0, updatedMatch.index ?? value.length)).trim()
		: value;

	const metaMatch = withoutUpdate.match(/\[([^\]]+)\]/);
	const statusMeta = metaMatch?.[1].trim() ?? null;

	const withoutMeta = withoutUpdate.replace(/\[[^\]]+\]/g, " ");
	const status = normalizeStatus(withoutMeta.replace(/_/g, " "));

	return { status, statusMeta, lastUpdated };
}

function getOrCreateGroup(groups: Map<string, MutableGroup>, circle: string): MutableGroup {
	const existing = groups.get(circle);
	if (existing) {
		return existing;
	}

	const created: MutableGroup = {
		links: new Set<string>(),
		missingLink: null,
		status: null,
		statusMeta: null,
		lastUpdated: null,
	};

	groups.set(circle, created);
	return created;
}

function collectGroups(messages: Message[]): GroupBase[] {
	const groups = new Map<string, MutableGroup>();

	for (const message of messages) {
		const content = typeof message.content === "string" ? message.content : "";
		if (!content) {
			continue;
		}

		let currentCircle: string | null = null;
		const lines = content.split(/\r?\n/);

		for (const line of lines) {
			const circleMatch = line.match(CIRCLE_REGEX);
			if (circleMatch) {
				const normalized = normalizeCircleName(circleMatch[1]);
				currentCircle = normalized.length > 0 && normalized !== " " ? normalized : null;

				if (currentCircle) {
					getOrCreateGroup(groups, currentCircle);
				}
			}

			if (!currentCircle) {
				continue;
			}

			const group = getOrCreateGroup(groups, currentCircle);

			const parsedStatus = parseStatusLine(line);
			if (parsedStatus) {
				if (parsedStatus.status) {
					group.status = parsedStatus.status;
				}

				if (parsedStatus.statusMeta) {
					group.statusMeta = parsedStatus.statusMeta;
				}

				if (parsedStatus.lastUpdated) {
					group.lastUpdated = parsedStatus.lastUpdated;
				}
			}

			for (const match of line.matchAll(MEGA_LINK_REGEX)) {
				group.links.add(match[0]);
			}

			if (MISSING_LINE_REGEX.test(line) && group.missingLink === null) {
				group.missingLink = line.match(URL_REGEX)?.at(0) ?? null;
			}
		}
	}

	return [...groups.entries()]
		.map(([circle, group]) => ({
			circle,
			links: [...group.links],
			missingLink: group.missingLink,
			status: group.status,
			statusMeta: group.statusMeta,
			lastUpdated: group.lastUpdated,
		}))
		.filter((group) => group.links.length > 0);
}

export async function transform(inputArg?: string, outputArg?: string): Promise<void> {
	const inputPath = resolveInputPath(inputArg, "dist/input.json");
	const outputPath = resolveOutputPath(outputArg, "dist/transformed.json");

	await assertFileExists(inputPath);

	const inputJson = await readJsonFile<TransformInputPayload>(inputPath);

	if (!Array.isArray(inputJson.messages)) {
		throw new Error("Invalid input JSON: expected top-level 'messages' array.");
	}

	const groups = collectGroups(inputJson.messages as Message[]);
	const outputJson: TransformOutputPayload = { groups };

	await writeJsonFile(outputPath, outputJson);

	const totalLinks = groups.reduce((sum, group) => sum + group.links.length, 0);
	console.log(`Wrote ${groups.length} circles and ${totalLinks} MEGA links to ${outputPath}`);
}
