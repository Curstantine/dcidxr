import { EventEmitter } from "node:events";
import { PassThrough, type Readable } from "node:stream";

import API from "./api.ts";
import { AES, d64, e64, formatKey, getCipher, megaDecrypt } from "./crypto/index.ts";
import type { Callback, DownloadOptions, FileOptions, LinkOptions } from "./types.ts";
import { createPromise, createSkipStream, streamToCb } from "./util.ts";

export const LABEL_NAMES = [
	"",
	"red",
	"orange",
	"yellow",
	"green",
	"blue",
	"purple",
	"grey",
] as const;

export class File extends EventEmitter {
	downloadId: string | [string, string];
	key: Buffer | null;
	type: number;
	directory: boolean;
	children?: File[];
	api: API;
	loadedFile?: string;
	size?: number;
	timestamp?: number;
	owner?: string;
	name: string | null = null;
	attributes?: Record<string, any>;
	label?: string;
	favorited?: boolean;
	nodeId?: string;
	storage?: any;
	parent?: File;
	shareId?: string;
	shared?: boolean;
	shareURL?: string;

	constructor(opt: FileOptions) {
		super();
		this.checkConstructorArgument(opt.downloadId);
		this.checkConstructorArgument(opt.key);
		this.checkConstructorArgument(opt.loadedFile);

		this.downloadId = opt.downloadId!;
		this.key = opt.key ? formatKey(opt.key) : null;
		this.type = opt.directory ? 1 : 0;
		this.directory = !!opt.directory;
		if (this.directory && !this.children) this.children = [];

		this.api = opt.api || API.getGlobalApi();
		if (!(this.api instanceof API)) {
			throw new Error("api must be an instance of API");
		}

		this.loadedFile = opt.loadedFile;
	}

	get createdAt(): number | undefined {
		return this.timestamp ? this.timestamp * 1000 : undefined;
	}

	checkConstructorArgument(value: any): void {
		if (typeof value === "string" && !/^[\w-]+$/.test(value)) {
			throw new Error(`Invalid argument: "${value}"`);
		}
	}

	loadMetadata(aes: AES | null, opt: Record<string, any>): void {
		this.size = opt.s || 0;
		this.timestamp = opt.ts || 0;
		this.type = opt.t;
		this.directory = !!opt.t;
		this.owner = opt.u;
		this.name = null;
		if (this.directory && !this.children) this.children = [];

		if (!aes || !opt.k) return;

		const keyAlternatives = opt.k.split("/").map((e: string) => e.split(":"));
		for (const parts of keyAlternatives) {
			this.key = formatKey(parts[parts.length - 1]);

			if (!this.key) continue;

			if (this.key.length <= 32) {
				aes.decryptECB(this.key);
			} else if (this.storage) {
				this.key = this.storage
					.decryptRsaKey(this.key)
					.subarray(0, this.directory ? 16 : 32);
			} else {
				this.key = null;
			}

			if (opt.a) {
				const gotSuccess = this.decryptAttributes(opt.a);
				if (gotSuccess) break;
			}
		}
	}

	decryptAttributes(at: string | Buffer): boolean {
		if (!this.key) return false;
		const bufferAt = typeof at === "string" ? d64(at) : at;
		getCipher(this.key).decryptCBC(bufferAt);

		const unpackedAttributes = File.unpackAttributes(bufferAt);
		if (unpackedAttributes) {
			this.parseAttributes(unpackedAttributes);
			return true;
		}

		return false;
	}

	parseAttributes(at: Record<string, any>): void {
		this.attributes = at;
		this.name = at.n || null;
		this.label = LABEL_NAMES[at.lbl || 0];
		this.favorited = !!at.fav;
	}

	loadAttributes(originalCb?: Callback<File>): Promise<File> {
		const [cb, promise] = createPromise(originalCb);

		const req: Record<string, any> = this.directory
			? {
					a: "f",
					c: 1,
					ca: 1,
					r: 1,
					_querystring: {
						n: this.downloadId,
					},
				}
			: {
					a: "g",
					p: this.downloadId,
				};

		this.api.request(req, (err, response) => {
			if (err) return cb(err);

			if (this.directory) {
				const filesMap: Record<string, File> = Object.create(null);
				const nodes = response.f;
				const folder = nodes.find(
					(node: any) =>
						node.k &&
						node.k.split("/").some((part: string) => node.h === part.split(":")[0]),
				);
				const aes = this.key ? new AES(this.key) : null;
				this.nodeId = folder.h;
				this.timestamp = folder.ts;
				filesMap[folder.h] = this;

				for (const file of nodes) {
					if (file === folder) continue;
					const fileObj = new File({ ...file, api: this.api });
					fileObj.loadMetadata(aes, file);

					fileObj.downloadId = [this.downloadId as string, file.h];
					filesMap[file.h] = fileObj;
				}

				for (const file of nodes) {
					const parent = filesMap[file.p];
					if (parent) {
						const fileObj = filesMap[file.h];
						parent.children?.push(fileObj);
						fileObj.parent = parent;
					}
				}

				this.loadMetadata(aes, folder);
				if (this.key && !this.attributes) {
					return cb(new Error("Attributes could not be decrypted with provided key."));
				}

				if (this.loadedFile) {
					const loadedNode = filesMap[this.loadedFile];
					if (typeof loadedNode === "undefined") {
						cb(new Error("Node (file or folder) not found in folder"));
					} else {
						cb(null, loadedNode);
					}
				} else {
					cb(null, this);
				}
			} else {
				this.size = response.s;
				this.decryptAttributes(response.at);

				if (this.key && !this.attributes) {
					return cb(new Error("Attributes could not be decrypted with provided key."));
				}

				cb(null, this);
			}
		});

		return promise;
	}

	download(options?: DownloadOptions | Callback<Buffer>, cb?: Callback<Buffer>): Readable {
		if (typeof options === "function") {
			cb = options;
			options = {};
		}

		const opts = options || {};
		const start = opts.start || 0;
		const apiStart = opts.returnCiphertext ? start : start - (start % 16);
		let end = opts.end ?? null;

		const maxConnections = opts.maxConnections || 4;
		const initialChunkSize = opts.initialChunkSize || 128 * 1024;
		const chunkSizeIncrement = opts.chunkSizeIncrement || 128 * 1024;
		const maxChunkSize = opts.maxChunkSize || 1024 * 1024;
		const ssl = API.handleForceHttps(opts.forceHttps) ? 2 : 0;

		const req: Record<string, any> = {
			a: "g",
			g: 1,
			ssl,
		};
		if (this.nodeId) {
			req.n = this.nodeId;
		} else if (Array.isArray(this.downloadId)) {
			req._querystring = {
				n: this.downloadId[0],
			};
			req.n = this.downloadId[1];
		} else {
			req.p = this.downloadId;
		}

		if (this.directory) {
			throw new Error("Can't download: folder download isn't supported");
		}

		if (!this.key && !opts.returnCiphertext) {
			throw new Error("Can't download: key isn't defined");
		}

		const decryptStream =
			this.key && !opts.returnCiphertext
				? megaDecrypt(this.key, {
						start: apiStart,
						disableVerification: apiStart !== 0 || end !== null,
					})
				: new PassThrough();

		const stream =
			apiStart === start
				? decryptStream
				: (decryptStream.pipe(createSkipStream(start - apiStart)) as any);

		const handleRetries = opts.handleRetries || File.defaultHandleRetries;

		this.api.request(req, (err, response) => {
			if (err) return stream.emit("error", err);
			if (typeof response.g !== "string" || !response.g.startsWith("http")) {
				return stream.emit(
					"error",
					new Error(
						"MEGA servers returned an invalid response, maybe caused by rate limit",
					),
				);
			}

			// Special case for empty files
			if (response.s === 0) return stream.end();

			if (end === null) end = response.s - 1;
			if (start > end!) {
				return stream.emit(
					"error",
					new Error("You can't download past the end of the file."),
				);
			}

			const targetEnd = end!;

			function handleMegaErrors(resp: Response) {
				if (resp.status === 200) return;
				if (resp.status === 509) {
					const timeLimit = resp.headers.get("x-mega-time-left");
					const error = Object.assign(
						new Error(`Bandwidth limit reached: ${timeLimit} seconds until it resets`),
						{ timeLimit },
					);
					stream.emit("error", error);
					return;
				}

				stream.emit("error", new Error(`MEGA returned a ${resp.status} status code`));
			}

			function handleError(err: any) {
				stream.emit("error", err);
			}

			let i = 0;
			stream.on("data", (d: Buffer) => {
				i += d.length;
				stream.emit("progress", {
					bytesLoaded: i,
					bytesTotal: response.s,
				});
			});

			if (maxConnections === 1) {
				const controller = new AbortController();
				stream.on("close", () => {
					controller.abort();
				});

				this.api
					.fetch(`${response.g}/${apiStart}-${targetEnd}`, {
						signal: controller.signal,
					})
					.then(async (res) => {
						handleMegaErrors(res);
						const body = res.body;
						if (!body) {
							throw new Error("Missing response body");
						} else if ("pipe" in body && typeof (body as any).pipe === "function") {
							(body as any).pipe(decryptStream);
						} else if (typeof body.getReader === "function") {
							const reader = body.getReader();
							const read = ({
								done,
								value,
							}: ReadableStreamReadResult<Uint8Array>): any => {
								if (done) {
									decryptStream.end();
								} else {
									decryptStream.write(Buffer.from(value));
									return reader.read().then(read);
								}
							};
							reader.read().then(read);
						} else {
							throw new Error("Single connection streaming not supported by fetch");
						}
					})
					.catch(handleError);

				return;
			}

			const chunkBuffer: Record<number, Buffer> = {};
			let lastStartedChunk = 0;
			let nextChunk = 0;
			let stopped = false;
			let currentOffset = apiStart;
			let chunkSize = initialChunkSize;

			stream.on("error", () => {
				stopped = true;
			});
			stream.on("close", () => {
				stopped = true;
			});

			const getChunk = () => {
				if (currentOffset > targetEnd) {
					stopped = true;
					if (lastStartedChunk === nextChunk) {
						decryptStream.end();
					}
					return;
				}

				const chunkOffset = currentOffset;
				const chunkMax = Math.min(targetEnd, chunkOffset + chunkSize - 1);
				const chunkNumber = lastStartedChunk++;

				let tries = 0;
				const tryFetchChunk = () => {
					tries++;

					this.api
						.fetch(`${response.g}/${chunkOffset}-${chunkMax}`)
						.then((res) => {
							handleMegaErrors(res);
							return res.arrayBuffer();
						})
						.then(
							(data) => {
								const dataBuffer = Buffer.from(data);
								chunkBuffer[chunkNumber] = dataBuffer;
								if (nextChunk === chunkNumber) {
									handleStreamWrite();
								}
							},
							(error) => {
								handleRetries(tries, error, (retryError) => {
									if (retryError) {
										handleError(retryError);
									} else {
										tryFetchChunk();
									}
								});
							},
						);
				};
				tryFetchChunk();

				currentOffset = chunkMax + 1;
				if (chunkSize < maxChunkSize) {
					chunkSize = chunkSize + chunkSizeIncrement;
				}
			};

			const handleStreamWrite = () => {
				let shouldWaitDrain = false;

				while (true) {
					const bufferChunk = chunkBuffer[nextChunk];
					if (!bufferChunk) break;
					shouldWaitDrain = !decryptStream.write(bufferChunk);
					delete chunkBuffer[nextChunk];
					nextChunk++;
					if (shouldWaitDrain) break;
				}

				if (stopped && lastStartedChunk === nextChunk) {
					decryptStream.end();
				}

				if (shouldWaitDrain) {
					decryptStream.once("drain", handleStreamWrite);
				} else {
					getChunk();
				}
			};

			for (let conn = 0; conn < maxConnections; conn++) {
				getChunk();
			}
		});

		if (cb) streamToCb(stream, cb);

		return stream;
	}

	downloadBuffer(
		options?: DownloadOptions | Callback<Buffer>,
		originalCb?: Callback<Buffer>,
	): Promise<Buffer> {
		if (typeof options === "function") {
			originalCb = options;
			options = {};
		}
		const [cb, promise] = createPromise(originalCb);
		this.download(options, cb);
		return promise;
	}

	link(
		options?: LinkOptions | boolean | Callback<string>,
		originalCb?: Callback<string>,
	): Promise<string> {
		if (typeof options === "function") {
			originalCb = options;
			options = { noKey: false };
		}
		const [cb, promise] = createPromise(originalCb);

		let linkOpts: LinkOptions = {};
		if (typeof options === "boolean") {
			linkOpts = { noKey: options };
		} else if (options) {
			linkOpts = options;
		}

		const downloadId = Array.isArray(this.downloadId) ? this.downloadId[1] : this.downloadId;
		let url = `https://mega.nz/${this.directory ? "folder" : "file"}/${downloadId}`;
		if (!linkOpts.noKey && this.key) url += `#${e64(this.key)}`;
		if (!linkOpts.noKey && this.loadedFile) {
			url += `/file/${this.loadedFile}`;
		}

		cb(null, url);
		return promise;
	}

	find(query: string | string[] | ((file: File) => boolean), deep?: boolean): File | null {
		if (!this.children) {
			throw new Error("You can only call .find on directories");
		}

		let matchFn: (file: File) => boolean;
		if (typeof query === "string") {
			matchFn = (file) => file.name === query;
		} else if (Array.isArray(query)) {
			matchFn = (file) => query.includes(file.name ?? "");
		} else if (typeof query === "function") {
			matchFn = query;
		} else {
			throw new Error(
				"Query must be a file matching function, an array of valid file names or a string with a file name",
			);
		}

		return this.children.reduce<File | null>((result, entry) => {
			if (result) return result;
			if (matchFn(entry)) return entry;
			if (entry.children && deep) {
				return entry.find(matchFn, deep);
			}
			return null;
		}, null);
	}

	filter(query: string | string[] | ((file: File) => boolean), deep?: boolean): File[] {
		if (!this.children) {
			throw new Error("You can only call .filter on directories");
		}

		let matchFn: (file: File) => boolean;
		if (typeof query === "string") {
			matchFn = (file) => file.name === query;
		} else if (Array.isArray(query)) {
			matchFn = (file) => query.includes(file.name ?? "");
		} else if (typeof query === "function") {
			matchFn = query;
		} else {
			throw new Error(
				"Query must be a file matching function, an array of valid file names or a string with a file name",
			);
		}

		return this.children.reduce<File[]>((results, entry) => {
			if (matchFn(entry)) results.push(entry);
			if (entry.children && deep) {
				return results.concat(entry.filter(matchFn, deep));
			}
			return results;
		}, []);
	}

	navigate(query: string | string[]): File | undefined {
		if (!this.children) {
			throw new Error("You can only call .navigate on directories");
		}

		const parts = typeof query === "string" ? query.split("/") : query;
		if (!Array.isArray(parts)) {
			throw new Error("Query must be an array or a string");
		}

		return parts.reduce<File | undefined>((node, name) => {
			return node?.children?.find((e) => e.name === name);
		}, this);
	}

	static fromURL(opt: string | FileOptions, extraOpt: Partial<FileOptions> = {}): File {
		if (typeof opt === "object") {
			return new File(opt);
		}

		const url = new URL(opt);
		if (url.hostname !== "mega.nz" && url.hostname !== "mega.co.nz") {
			throw new Error("Invalid URL: wrong hostname");
		}
		if (!url.hash) throw new Error("Invalid URL: no hash");

		if (url.pathname.match(/\/(file|folder)\//) !== null) {
			const split = url.hash.slice(1).split("/file/");
			const fileHandler = url.pathname.substring(url.pathname.lastIndexOf("/") + 1);
			const fileKey = split[0];

			if ((fileHandler && !fileKey) || (!fileHandler && fileKey)) {
				throw new Error("Invalid URL: too few arguments");
			}

			return new File({
				downloadId: fileHandler,
				key: fileKey,
				directory: url.pathname.includes("/folder/"),
				loadedFile: split[1],
				...extraOpt,
			});
		} else {
			const split = url.hash.split("!");
			if (split[0] !== "#" && split[0] !== "#F") {
				throw new Error("Invalid URL: format not recognized");
			}
			if (split.length <= 1) throw new Error("Invalid URL: too few arguments");
			if (split.length >= (split[0] === "#" ? 4 : 5)) {
				throw new Error("Invalid URL: too many arguments");
			}

			return new File({
				downloadId: split[1],
				key: split[2],
				directory: split[0] === "#F",
				loadedFile: split[3],
				...extraOpt,
			});
		}
	}

	static unpackAttributes(at: Buffer): Record<string, any> | undefined {
		let end = 0;
		while (end < at.length && at.readUInt8(end)) end++;

		const str = at.subarray(0, end).toString();
		if (!str.startsWith('MEGA{"')) return;

		try {
			return JSON.parse(str.slice(4));
		} catch (e) {
			console.error("Failed to parse attributes", e);
		}
	}

	static defaultHandleRetries(
		tries: number,
		error: Error | null,
		cb: (err?: Error | null) => void,
	): void {
		if (tries > 8) {
			cb(error);
		} else {
			setTimeout(cb, 1000 * 2 ** tries);
		}
	}
}

export default File;
