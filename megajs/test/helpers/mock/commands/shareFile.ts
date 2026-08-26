import type { URL } from "node:url";
import type { MockServerOptions } from "../types.ts";
import { getUhFromURL } from "../util.ts";

export async function shareFile(data: any, options: MockServerOptions, url: URL): Promise<any> {
	const uh = getUhFromURL(url);
	if (!uh) return -1;

	const fileShares = options.state!.shares;
	let shareId: string | undefined;
	for (const [id, share] of fileShares) {
		if (share.handler === data.n) {
			shareId = id;
			break;
		}
	}

	if (!shareId) {
		shareId = options.generateId!();
		fileShares.set(shareId, {
			handler: data.n,
			uh,
		});
	}

	return shareId;
}
