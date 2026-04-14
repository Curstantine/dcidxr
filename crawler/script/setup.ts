import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { config } from "dotenv";

config({ path: [".env.local", ".env"] });

const DATA_ROOT = process.env.RAILWAY_VOLUME_MOUNT_PATH || "/data";
const MESSAGES_DIR = path.join(DATA_ROOT, "messages");

const sourceUrl = process.env.MESSAGES_DL_URL?.trim();
if (!sourceUrl) throw new Error("MESSAGES_DL_URL is not set");

const timestamp = Date.now();
const outputPath = path.join(MESSAGES_DIR, `${timestamp}.json`);

await mkdir(MESSAGES_DIR, { recursive: true });

const response = await fetch(sourceUrl);
if (!response.ok) {
	throw new Error(`Failed to download messages: ${response.status} ${response.statusText}`);
}

const text = await response.text();
await writeFile(outputPath, text, "utf8");

console.log(`Downloaded messages to ${outputPath}`);
