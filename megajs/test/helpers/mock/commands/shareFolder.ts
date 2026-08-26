import type { URL } from "node:url";
import type { MockServerOptions } from "../types.ts";
import { getUhFromURL, handleCr } from "../util.ts";

export async function shareFolder(data: any, options: MockServerOptions, url: URL): Promise<any> {
	const uh = getUhFromURL(url);
	if (!uh) return -1;

	const userData = options.state!.users.get(uh);
	if (!userData) return -1;

	userData.shares.push({
		h: data.n,
		ha: data.ha,
		k: data.ok,
	});

	await handleCr(data.cr, uh, options);
	options.state!.users.set(uh, userData);

	return "";
}
