import type { IncomingMessage } from "node:http";
import type { URL } from "node:url";
import type { MockServerOptions } from "../types.ts";

export function uploadFile(
	data: any,
	options: MockServerOptions,
	_url: URL,
	req: IncomingMessage,
): any {
	return {
		p: `http://${req.headers.host}/upload/${options.generateId!()}/${data.s}`,
	};
}
