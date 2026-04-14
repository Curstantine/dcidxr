import type { Dirent } from "node:fs";
import { mkdir, readdir, unlink } from "node:fs/promises";
import path from "node:path";

import { fetchReleases } from "./fetch.ts";
import { sync } from "./sync.ts";
import { transform } from "./transform.ts";

const DATA_ROOT = process.env.RAILWAY_VOLUME_MOUNT_PATH?.trim() || "/data";
const MESSAGE_INPUT_DIR = path.join(DATA_ROOT, "messages");
const TRANSFORMED_OUTPUT_DIR = path.join(DATA_ROOT, "transformed");
const RELEASES_OUTPUT_DIR = path.join(DATA_ROOT, "releases");

type TimestampedFile = {
	path: string;
	timestamp: bigint;
};

function parseTimestampFromFileName(fileName: string): bigint | null {
	const parsed = path.parse(fileName);
	if (!/^\d+$/.test(parsed.name)) return null;

	try {
		return BigInt(parsed.name);
	} catch {
		return null;
	}
}

async function findTimestampedMessageFiles(): Promise<TimestampedFile[]> {
	let entries: Dirent<string>[];

	try {
		entries = await readdir(MESSAGE_INPUT_DIR, {
			withFileTypes: true,
			encoding: "utf8",
		});
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		throw new Error(`Failed to read message input directory ${MESSAGE_INPUT_DIR}: ${message}`);
	}

	const candidates = entries
		.filter((entry) => entry.isFile())
		.map((entry) => {
			const timestamp = parseTimestampFromFileName(entry.name);
			if (timestamp === null) return null;

			return {
				path: path.join(MESSAGE_INPUT_DIR, entry.name),
				timestamp,
			} satisfies TimestampedFile;
		})
		.filter((entry): entry is TimestampedFile => entry !== null);

	if (candidates.length === 0) {
		throw new Error(`No timestamped message input files were found in ${MESSAGE_INPUT_DIR}`);
	}

	candidates.sort((a, b) => {
		if (a.timestamp === b.timestamp) {
			return a.path.localeCompare(b.path);
		}

		return a.timestamp > b.timestamp ? -1 : 1;
	});

	return candidates;
}

export async function start(): Promise<void> {
	const messageInputs = await findTimestampedMessageFiles();
	const latestInput = messageInputs[0];
	const timestamp = latestInput.timestamp.toString();

	await mkdir(TRANSFORMED_OUTPUT_DIR, { recursive: true });
	await mkdir(RELEASES_OUTPUT_DIR, { recursive: true });

	const transformedOutputPath = path.join(TRANSFORMED_OUTPUT_DIR, `${timestamp}.json`);
	const releasesOutputPath = path.join(RELEASES_OUTPUT_DIR, `${timestamp}.json`);

	console.log(`Using latest message input: ${latestInput.path}`);

	await transform(latestInput.path, transformedOutputPath);
	await fetchReleases(transformedOutputPath, releasesOutputPath);
	await sync(releasesOutputPath);
	await Promise.all(messageInputs.map((x) => unlink(x.path)));
}
