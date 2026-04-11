import fs from "node:fs";
import path from "node:path";

const MEGA_LINK_REGEX = /https?:\/\/(?:www\.)?mega\.(?:nz|co\.nz)\/[^\s)>]+/gi;
const URL_REGEX = /https?:\/\/[^\s)>]+/gi;
const CIRCLE_REGEX = /^\s*\*\*(.+?)\*\*(?:\s+.*)?$/;
const STATUS_LINE_REGEX = /^\s*Status(?:\s*\([^)]*\))?\s*:\s*(.+)$/i;
const MISSING_LINE_REGEX = /^\s*Missing(?:\s*\([^)]*\))?\s*:/i;

type Message = {
	content?: unknown;
};

type InputPayload = {
	messages?: unknown;
};

type Group = {
	circle: string;
	links: string[];
	missingLinks: string[];
	status: string | null;
	statusMeta: string | null;
	lastUpdated: string | null;
};

type MutableGroup = {
	links: Set<string>;
	missingLinks: Set<string>;
	status: string | null;
	statusMeta: string | null;
	lastUpdated: string | null;
};

function normalizeCircleName(rawName: string): string {
	return rawName.trim();
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
	const updatedMatch = value.match(/-\s*(?:Last\s+)?Updated\s*:?\s*(.+)$/i);
	const lastUpdated = updatedMatch?.[1].trim() ?? null;

	const withoutUpdate = updatedMatch
		? value.slice(0, Math.max(0, updatedMatch.index ?? value.length)).trim()
		: value;

	const metaMatch = withoutUpdate.match(/\[([^\]]+)\]/);
	const statusMeta = metaMatch?.[1].trim() ?? null;

	const withoutMeta = withoutUpdate.replace(/\[[^\]]+\]/g, " ");
	const status = withoutMeta.replace(/_/g, " ").replace(/\s+/g, " ").trim() || null;

	return { status, statusMeta, lastUpdated };
}

function getOrCreateGroup(groups: Map<string, MutableGroup>, circle: string): MutableGroup {
	if (!groups.has(circle)) {
		groups.set(circle, {
			links: new Set<string>(),
			missingLinks: new Set<string>(),
			status: null,
			statusMeta: null,
			lastUpdated: null,
		});
	}

	// biome-ignore lint/style/noNonNullAssertion: group is guaranteed to exist
	return groups.get(circle)!;
}

function collectGroups(messages: Message[]): Group[] {
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

			const links = [...line.matchAll(MEGA_LINK_REGEX)].map((match) => match[0]);
			for (const link of links) {
				group.links.add(link);
			}

			if (MISSING_LINE_REGEX.test(line)) {
				const missingLinks = [...line.matchAll(URL_REGEX)].map((match) => match[0]);
				for (const missingLink of missingLinks) {
					group.missingLinks.add(missingLink);
				}
			}
		}
	}

	return [...groups.entries()]
		.map(([circle, group]) => ({
			circle,
			links: [...group.links],
			missingLinks: [...group.missingLinks],
			status: group.status,
			statusMeta: group.statusMeta,
			lastUpdated: group.lastUpdated,
		}))
		.filter((group) => group.links.length > 0);
}

export function transform(inputArg?: string, outputArg?: string): void {
	const inputPath = path.resolve(process.cwd(), inputArg ?? "input.messages.json");
	const outputPath = path.resolve(process.cwd(), outputArg ?? "output.messages.json");

	if (!fs.existsSync(inputPath)) {
		throw new Error(`Input file not found: ${inputPath}`);
	}

	const inputRaw = fs.readFileSync(inputPath, "utf8");
	const inputJson = JSON.parse(inputRaw) as InputPayload;

	if (!Array.isArray(inputJson.messages)) {
		throw new Error("Invalid input JSON: expected top-level 'messages' array.");
	}

	const groups = collectGroups(inputJson.messages as Message[]);
	const outputJson = { groups };

	fs.writeFileSync(outputPath, JSON.stringify(outputJson, null, 2));

	const totalLinks = groups.reduce((sum, group) => sum + group.links.length, 0);
	console.log(`Wrote ${groups.length} circles and ${totalLinks} MEGA links to ${outputPath}`);
}
