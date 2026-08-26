import fs from "node:fs/promises";
import path from "node:path";
import type { URL } from "node:url";
import type { MockFile, MockServerOptions } from "../types.ts";
import { getUhFromURL, handleCr } from "../util.ts";

export async function createNewFile(data: any, options: MockServerOptions, url: URL): Promise<any> {
	const uh = getUhFromURL(url);
	if (!uh) return -1;

	let userData = options.state!.users.get(uh);
	if (!userData) {
		userData = { files: [], shares: [] };
		options.state!.users.set(uh, userData);
	}

	if (!data.n || data.n.length === 0) {
		console.log("Expecting a file, got none");
		return -1;
	}

	const files: MockFile[] = [];
	for (const input of data.n) {
		const finalHandler = options.generateId!();
		const type = Number(input.t) || 0;
		const file: MockFile = {
			h: finalHandler,
			t: type,
			a: input.a,
			k: input.k,
			p: data.t,
			ts: Math.floor(Date.now() / 1000),
			u: uh,
		};

		if (type === 0) {
			const tempUploadPath = path.resolve(options.dataFolder, `temp_${input.h}`);
			const targetFilePath = path.resolve(options.dataFolder, `file_${finalHandler}`);

			const fileStat = await fs.stat(tempUploadPath);
			file.s = fileStat.size;
			await fs.rename(tempUploadPath, targetFilePath);
		}

		if (data.cr) await handleCr(data.cr, uh, options);

		userData.files.push(file);
		files.push(file);
	}

	return { f: files };
}
