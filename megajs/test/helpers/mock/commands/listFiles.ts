import type { URL } from "node:url";
import type { MockFile, MockServerOptions } from "../types.ts";
import { getUhFromURL } from "../util.ts";

export async function listFiles(data: any, options: MockServerOptions, url: URL): Promise<any> {
	const nParam = url.searchParams.get("n");
	if (nParam) return listSharedFolder(data, options, url);

	const uh = getUhFromURL(url);
	if (!uh) return -1;

	const files: MockFile[] = [];

	const timestamp = Math.floor(Date.now() / 1000);
	for (let i = 2; i <= 4; i++) {
		files.push({
			h: `handler${i}`,
			p: "",
			u: uh,
			t: i,
			a: "",
			k: "",
			ts: timestamp,
		});
	}

	const userData = options.state!.users.get(uh) || {
		files: [],
		shares: [],
	};

	for (const file of userData.files) {
		files.push(file);
	}
	const shares = userData.shares;

	return {
		f: files,
		ok: shares,
	};
}

async function listSharedFolder(_data: any, options: MockServerOptions, url: URL): Promise<any> {
	const shareId = url.searchParams.get("n")!;
	const fileShares = options.state!.shares;
	const share = fileShares.get(shareId);
	if (!share) return -9;

	const userState = options.state!.users.get(share.uh);
	if (!userState) return -9;

	const files: Record<string, MockFile> = {};
	const parents: Record<string, string[]> = {};

	for (const file of userState.files) {
		files[file.h] = file;
		if (file.p) {
			if (!parents[file.p]) parents[file.p] = [];
			parents[file.p].push(file.h);
		}
	}

	const fileList = getFileList(share.handler, files, parents);
	return { f: fileList };
}

function getFileList(
	handler: string,
	files: Record<string, MockFile>,
	parents: Record<string, string[]>,
): MockFile[] {
	let list: MockFile[] = files[handler] ? [files[handler]] : [];
	const children = parents[handler] || [];
	for (const child of children) {
		list = list.concat(getFileList(child, files, parents));
	}
	return list;
}
