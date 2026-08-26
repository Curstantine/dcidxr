import type { IncomingMessage } from "node:http";
import type { URL } from "node:url";
import type { MockFile, MockServerOptions } from "../types.ts";

export function getFileInfo(
	data: any,
	options: MockServerOptions,
	_url: URL,
	req: IncomingMessage,
): any {
	let file: MockFile | undefined;

	if (data.n) {
		for (const [, userData] of options.state!.users) {
			file = userData.files.find((e) => e.h === data.n);
			if (file) break;
		}
	} else if (data.p) {
		const share = options.state!.shares.get(data.p);
		if (!share) return -9;
		const user = options.state!.users.get(share.uh);
		file = user?.files.find((e) => e.h === share.handler);
	} else {
		return -1;
	}

	if (!file) return -9;

	const baseURL = `http://${req.headers.host}`;
	const downloadURL = `${baseURL}/download/${file.h}`;

	return {
		g: downloadURL,
		s: file.s,
		at: file.a,
	};
}
