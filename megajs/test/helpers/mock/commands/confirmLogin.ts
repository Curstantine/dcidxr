import type { URL } from "node:url";
import type { MockServerOptions } from "../types.ts";
import { getUhFromURL } from "../util.ts";

export function confirmLogin(_data: any, _options: MockServerOptions, url: URL): any {
	const uh = getUhFromURL(url);
	if (!uh) return -1;

	return {
		u: uh,
		name: "Test User",
	};
}
