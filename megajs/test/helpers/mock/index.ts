import http, { type IncomingMessage, type ServerResponse } from "node:http";
import { URL } from "node:url";

import { confirmLogin } from "./commands/confirmLogin.ts";
import { createNewFile } from "./commands/createNewFile.ts";
import { deleteFile } from "./commands/deleteFile.ts";
import { getAccountInfo } from "./commands/getAccountInfo.ts";
import { getFileInfo } from "./commands/getFileInfo.ts";
import { handleDownload } from "./commands/handleDownload.ts";
import { handleLogin } from "./commands/handleLogin.ts";
import { handleUpload } from "./commands/handleUpload.ts";
import { listFiles } from "./commands/listFiles.ts";
import { logout } from "./commands/logout.ts";
import { preLoginRequest } from "./commands/preLoginRequest.ts";
import { shareFile } from "./commands/shareFile.ts";
import { shareFolder } from "./commands/shareFolder.ts";
import { updateAttribute } from "./commands/updateAttribute.ts";
import { uploadFile } from "./commands/uploadFile.ts";
import type { MockServer, MockServerOptions, MockState } from "./types.ts";
import { generateIdCounter } from "./util.ts";

type CommandHandler = (
	data: any,
	options: MockServerOptions,
	url: URL,
	req: IncomingMessage,
	res: ServerResponse,
) => any;

const commands: Record<string, CommandHandler> = {
	a: updateAttribute,
	d: deleteFile,
	f: listFiles,
	g: getFileInfo,
	l: shareFile,
	p: createNewFile,
	s2: shareFolder,
	u: uploadFile,
	ug: confirmLogin,
	uq: getAccountInfo,
	us: handleLogin,
	us0: preLoginRequest,
	sml: logout,
};

export function createServer(options: MockServerOptions): MockServer {
	normalizeOptions(options);

	const server = http.createServer(async (req: IncomingMessage, res: ServerResponse) => {
		res.setHeader("Access-Control-Allow-Origin", "*");
		res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept, X-Requested-With");

		if (req.method === "OPTIONS") {
			res.statusCode = 200;
			res.end();
			return;
		}

		const baseURL = `http://${req.headers.host || "127.0.0.1"}`;
		const parsedURL = new URL(req.url || "/", baseURL);

		try {
			if (parsedURL.pathname === "/cs") {
				if (req.method !== "POST") {
					res.statusCode = 400;
					res.end("only post allowed");
					return;
				}
				const results = await handleCs(options, parsedURL, req, res);
				sendResponse(res, 200, results);
				return;
			}

			if (parsedURL.pathname.startsWith("/upload")) {
				if (req.method !== "POST") {
					res.statusCode = 400;
					res.end("only post allowed");
					return;
				}
				const uploadResult = await handleUpload(options, parsedURL, req, res);
				sendResponse(res, 200, uploadResult);
				return;
			}

			if (parsedURL.pathname.startsWith("/download")) {
				await handleDownload(options, parsedURL, req, res);
				return;
			}

			sendResponse(res, 400, "Unknown method");
		} catch (error: any) {
			console.error("Mock server error:", error);
			res.statusCode = 500;
			res.end(error?.message || "Internal Server Error");
		}
	}) as MockServer;

	server.state = options.state!;
	return server;
}

function normalizeOptions(options: MockServerOptions): void {
	if (!options.state) options.state = {} as MockState;
	if (!options.dataFolder) throw new Error("dataFolder should be defined");
	if (!options.generateId) {
		options.generateId = generateIdCounter(options.state);
	}

	const state = options.state;
	const keys = ["users", "shares", "uploadStates", "loginData"] as const;
	for (const key of keys) {
		if (!state[key]) state[key] = new Map() as any;
		if (!(state[key] instanceof Map)) state[key] = new Map(state[key]) as any;
	}
}

async function handleCs(
	options: MockServerOptions,
	url: URL,
	req: IncomingMessage,
	res: ServerResponse,
): Promise<any[]> {
	const postData = await readJson(req);
	if (!Array.isArray(postData)) throw new Error("not an array");

	const results = [];
	for (const command of postData) {
		const handler = commands[command.a];
		let result = -1;
		try {
			result = await handler(command, options, url, req, res);
		} catch (err) {
			console.error("Command error:", err);
		}
		results.push(result);
	}

	return results;
}

async function readJson(req: IncomingMessage): Promise<any> {
	const chunks: Buffer[] = [];
	for await (const chunk of req) {
		chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
	}
	const body = Buffer.concat(chunks).toString("utf-8");
	return JSON.parse(body);
}

function sendResponse(res: ServerResponse, statusCode: number, data: any): void {
	res.statusCode = statusCode;
	if (Buffer.isBuffer(data)) {
		res.setHeader("Content-Type", "application/octet-stream");
		res.setHeader("Content-Length", data.length.toString());
		res.end(data);
	} else if (typeof data === "object" && data !== null) {
		res.setHeader("Content-Type", "application/json");
		res.end(JSON.stringify(data));
	} else {
		res.end(String(data));
	}
}

export { createServer as megamock };
export default createServer;
