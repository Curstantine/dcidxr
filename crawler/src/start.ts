import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { fetchReleases } from "./fetch.ts";
import { sync } from "./sync.ts";
import { transform } from "./transform.ts";

import "./utils/prelude.ts";

const DIST_DIR = path.resolve(process.cwd(), "dist");
const INPUT_PATH = path.join(DIST_DIR, "input.json");

async function download(): Promise<void> {
	const source = process.env.MESSAGES_DL_URL;
	if (!source) throw new Error("MESSAGES_DL_URL is not set");

	await mkdir(DIST_DIR, { recursive: true });

	const res = await fetch(source);
	if (!res.ok) throw new Error(`Failed to download messages: ${res.status} ${res.statusText}`);

	const rawJson = await res.text();
	await writeFile(INPUT_PATH, rawJson, "utf8");

	console.log(`Downloaded messages to ${INPUT_PATH}`);
}

export async function start(): Promise<void> {
	await download();
	await transform();
	await fetchReleases();
	await sync();

	await rm(INPUT_PATH, { force: true });
}
