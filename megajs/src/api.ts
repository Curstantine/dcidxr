import { EventEmitter } from "node:events";
import { Agent as HttpAgent } from "node:http";
import { Agent as HttpsAgent } from "node:https";

import { generateHashcashToken } from "./crypto/index.ts";
import type { APIOptions, Callback } from "./types.ts";
import { createPromise } from "./util.ts";

const MAX_RETRIES = 4;
const ERRORS: Record<number, string> = {
	1: "EINTERNAL (-1): An internal error has occurred. Please submit a bug report, detailing the exact circumstances in which this error occurred.",
	2: "EARGS (-2): You have passed invalid arguments to this command.",
	3: `EAGAIN (-3): A temporary congestion or server malfunction prevented your request from being processed. No data was altered. Retried ${MAX_RETRIES} times.`,
	4: "ERATELIMIT (-4): You have exceeded your command weight per time quota. Please wait a few seconds, then try again (this should never happen in sane real-life applications).",
	5: "EFAILED (-5): The upload failed. Please restart it from scratch.",
	6: "ETOOMANY (-6): Too many concurrent IP addresses are accessing this upload target URL.",
	7: "ERANGE (-7): The upload file packet is out of range or not starting and ending on a chunk boundary.",
	8: "EEXPIRED (-8): The upload target URL you are trying to access has expired. Please request a fresh one.",
	9: "ENOENT (-9): Object (typically, node or user) not found. Wrong password?",
	10: "ECIRCULAR (-10): Circular linkage attempted",
	11: "EACCESS (-11): Access violation (e.g., trying to write to a read-only share)",
	12: "EEXIST (-12): Trying to create an object that already exists",
	13: "EINCOMPLETE (-13): Trying to access an incomplete resource",
	14: "EKEY (-14): A decryption operation failed (never returned by the API)",
	15: "ESID (-15): Invalid or expired user session, please relogin",
	16: "EBLOCKED (-16): User blocked",
	17: "EOVERQUOTA (-17): Request over quota",
	18: "ETEMPUNAVAIL (-18): Resource temporarily not available, please try again later",
	19: "ETOOMANYCONNECTIONS (-19)",
	24: "EGOINGOVERQUOTA (-24)",
	25: "EROLLEDBACK (-25)",
	26: "EMFAREQUIRED (-26): Multi-Factor Authentication Required",
	27: "EMASTERONLY (-27)",
	28: "EBUSINESSPASTDUE (-28)",
	29: "EPAYWALL (-29): ODQ paywall state",
	400: "ETOOERR (-400)",
	401: "ESHAREROVERQUOTA (-401)",
};

const DEFAULT_GATEWAY = "https://g.api.mega.co.nz/";
const DEFAULT_HTTP_AGENT = new HttpAgent({ keepAlive: true });
const DEFAULT_HTTPS_AGENT = new HttpsAgent({ keepAlive: true });

export class API extends EventEmitter {
	keepalive?: boolean;
	counterId: number;
	gateway: string;
	userAgent: string | null;
	httpAgent: HttpAgent | null;
	httpsAgent: HttpsAgent | null;
	fetch: typeof fetch;
	closed: boolean;
	sid?: string;
	sn?: AbortController;
	static globalApi?: API;

	constructor(keepalive = false, opt: APIOptions = {}) {
		super();
		this.keepalive = keepalive;
		this.counterId = Math.floor(Math.random() * 1e10);
		this.gateway = opt.gateway || DEFAULT_GATEWAY;

		const shouldAvoidUA = API.getShouldAvoidUA();
		this.userAgent =
			opt.userAgent === null || shouldAvoidUA
				? null
				: `${opt.userAgent || ""} megajs/1.3.9`.trim();

		this.httpAgent = opt.httpAgent !== undefined ? opt.httpAgent : DEFAULT_HTTP_AGENT;
		this.httpsAgent = opt.httpsAgent !== undefined ? opt.httpsAgent : DEFAULT_HTTPS_AGENT;

		this.fetch = opt.fetch || this.defaultFetch.bind(this);
		this.closed = false;
	}

	async defaultFetch(
		url: string | URL | Request,
		opts: RequestInit & { agent?: any; headers?: any } = {},
	): Promise<Response> {
		if (!opts.agent) {
			opts.agent = (parsedUrl: URL) =>
				parsedUrl.protocol === "http:" ? this.httpAgent : this.httpsAgent;
		}

		if (this.userAgent) {
			if (!opts.headers) opts.headers = {};
			if (typeof opts.headers.set === "function") {
				if (!opts.headers.has("user-agent")) {
					opts.headers.set("user-agent", this.userAgent);
				}
			} else if (!opts.headers["user-agent"]) {
				opts.headers["user-agent"] = this.userAgent;
			}
		}

		return globalThis.fetch(url, opts);
	}

	request(json: any, originalCb?: Callback, retryno = 0): Promise<any> {
		const isLogout = json.a === "sml";
		if (this.closed && !isLogout) throw new Error("API is closed");
		const [cb, promise] = createPromise(originalCb);

		// Don't increment counterId when re-requesting with a hashcash
		if (typeof json._hashcash !== "string") {
			this.counterId++;
		}

		const qs: Record<string, string> = {
			id: this.counterId.toString(),
		};

		if (this.sid) {
			qs.sid = this.sid;
		}

		if (typeof json._querystring === "object") {
			Object.assign(qs, json._querystring);
			delete json._querystring;
		}

		const headers: Record<string, string> = {
			"Content-Type": "application/json",
		};
		if (typeof json._hashcash === "string") {
			headers["X-Hashcash"] = json._hashcash;
			delete json._hashcash;
		}

		this.fetch(`${this.gateway}cs?${new URLSearchParams(qs)}`, {
			method: "POST",
			headers,
			body: JSON.stringify([json]),
		})
			.then(async (resp) => {
				const hashcashChallenge = resp.headers.get("X-Hashcash");
				if (hashcashChallenge) {
					json._hashcash = await generateHashcashToken(hashcashChallenge);
					// Simulate an EAGAIN response
					return -3;
				}
				return handleApiResponse(resp);
			})
			.then((resp) => {
				if (this.closed && !isLogout) return;
				if (!resp) return cb(new Error("Empty response"));

				// Some error codes are returned as num, some as array with number.
				let responseData = resp;
				if (Array.isArray(responseData) && responseData.length) {
					responseData = responseData[0];
				}

				let err: Error | null = null;
				if (typeof responseData === "number" && responseData < 0) {
					if (responseData === -3) {
						if (retryno < MAX_RETRIES) {
							return setTimeout(
								() => {
									this.request(json, cb, retryno + 1);
								},
								2 ** (retryno + 1) * 1e3,
							);
						}
					}
					err = new Error(ERRORS[-responseData] || `Unknown error (${responseData})`);
				} else {
					if (this.keepalive && responseData && responseData.sn) {
						this.pull(responseData.sn);
					}
				}
				cb(err, responseData);
			})
			.catch((err) => {
				cb(err);
			});

		return promise;
	}

	pull(sn: string, retryno = 0): void {
		const controller = new AbortController();
		const ssl = API.handleForceHttps() ? 1 : 0;
		this.sn = controller;
		this.fetch(
			`${this.gateway}sc?${new URLSearchParams({ sn, ssl: ssl.toString(), sid: this.sid || "" })}`,
			{
				method: "POST",
				signal: controller.signal,
			},
		)
			.then(handleApiResponse)
			.then((resp) => {
				this.sn = undefined;
				if (this.closed) return;

				if (typeof resp === "number" && resp < 0) {
					if (resp === -3) {
						if (retryno < MAX_RETRIES) {
							return setTimeout(
								() => {
									this.pull(sn, retryno + 1);
								},
								2 ** (retryno + 1) * 1e3,
							);
						}
					}
					this.emit("error", new Error(ERRORS[-resp] || `Unknown error (${resp})`));
				}

				if (resp?.w) {
					this.wait(resp.w, sn);
				} else if (resp?.sn) {
					if (resp.a) {
						this.emit("sc", resp.a);
					}
					this.pull(resp.sn);
				}
			})
			.catch(ignoreAbortError)
			.catch((error) => {
				this.emit("error", error);
			});
	}

	wait(url: string, sn: string): void {
		const controller = new AbortController();
		this.sn = controller;
		this.fetch(url, {
			method: "POST",
			signal: controller.signal,
		})
			.catch(() => {})
			.then(() => {
				this.sn = undefined;
				this.pull(sn);
			});
	}

	close(): void {
		if (this.sn) this.sn.abort();
		this.closed = true;
	}

	static getGlobalApi(): API {
		if (!API.globalApi) {
			API.globalApi = new API();
		}
		return API.globalApi;
	}

	static handleForceHttps(userOpt?: boolean): boolean {
		if (userOpt != null) return userOpt;
		return !globalThis.isSecureContext;
	}

	static getShouldAvoidUA(): boolean {
		return typeof globalThis.navigator !== "undefined";
	}
}

async function handleApiResponse(response: Response): Promise<any> {
	if (response.statusText === "Server Too Busy") {
		return -3;
	}

	if (!response.ok) {
		throw new Error(`Server returned error: ${response.statusText}`);
	}

	return response.json();
}

function ignoreAbortError(error: any): void {
	if (error?.name !== "AbortError") throw error;
}

export default API;
