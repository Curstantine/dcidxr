import fs from "node:fs/promises";
import path from "node:path";
import type { URL } from "node:url";
import type { MockServerOptions } from "../types.ts";
import { getUhFromURL } from "../util.ts";

export async function deleteFile(data: any, options: MockServerOptions, url: URL): Promise<any> {
	const uh = getUhFromURL(url);
	if (!uh) return -1;

	const userData = options.state!.users.get(uh);
	if (!userData) return -1;

	const fileIndex = userData.files.findIndex((e) => e.h === data.n);
	if (fileIndex === -1) return -1;
	userData.files.splice(fileIndex, 1);

	const filePath = path.resolve(options.dataFolder, `file_${data.n}`);
	await fs.unlink(filePath).catch(() => {});

	return {};
}
