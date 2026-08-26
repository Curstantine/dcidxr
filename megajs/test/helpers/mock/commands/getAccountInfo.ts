import type { URL } from "node:url";
import type { MockServerOptions } from "../types.ts";
import { getUhFromURL } from "../util.ts";

export async function getAccountInfo(
	_data: any,
	options: MockServerOptions,
	url: URL,
): Promise<any> {
	const uh = getUhFromURL(url);
	if (!uh) return -1;

	const userData = options.state!.users.get(uh) || {
		files: [],
		shares: [],
	};

	const spaceUsed = userData.files.reduce((sum, file) => {
		return sum + (file.s || 0);
	}, 0);

	return {
		utype: 0,
		cstrg: spaceUsed,
		mstrg: 50 * 1024 * 1024 * 1024,
	};
}
