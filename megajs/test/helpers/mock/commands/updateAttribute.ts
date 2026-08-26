import type { URL } from "node:url";
import type { MockServerOptions } from "../types.ts";
import { getUhFromURL } from "../util.ts";

export async function updateAttribute(
	data: any,
	options: MockServerOptions,
	url: URL,
): Promise<any> {
	const uh = getUhFromURL(url);
	if (!uh) return -1;

	const userData = options.state!.users.get(uh) || {
		files: [],
		shares: [],
	};

	const file = userData.files.find((e) => e.h === data.n);
	if (!file) return -1;
	file.a = data.at;

	options.state!.users.set(uh, userData);

	return {};
}
