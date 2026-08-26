import fs from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import type { URL } from "node:url";
import type { MockServerOptions } from "../types.ts";

export async function handleDownload(
	options: MockServerOptions,
	parsedURL: URL,
	req: IncomingMessage,
	res: ServerResponse,
): Promise<void> {
	if (typeof options.simulateDownloadError === "function") {
		const error = options.simulateDownloadError(parsedURL, req, res);
		if (error) throw error;
	}

	const [, , handler, range = ""] = parsedURL.pathname.split("/");
	const [startStr = "0", endStr = ""] = range.split("-");
	const start = Number(startStr) || 0;
	const end = endStr !== "" ? Number(endStr) : Infinity;
	const targetFilePath = path.resolve(options.dataFolder, `file_${handler}`);

	const stream = fs.createReadStream(targetFilePath, { start, end });
	stream.once("error", (error) => {
		res.statusCode = 500;
		res.end(error.message);
	});
	stream.once("readable", () => {
		res.statusCode = 200;
		stream.pipe(res);
	});
}
