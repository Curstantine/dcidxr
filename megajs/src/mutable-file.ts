import crypto from "node:crypto";
import { PassThrough } from "node:stream";

import API from "./api.ts";
import { AES, e64, formatKey, getCipher, megaEncrypt, unmergeKeyMac } from "./crypto/index.ts";
import File, { LABEL_NAMES } from "./file.ts";
import type { Storage } from "./storage.ts";
import type {
	Callback,
	LabelType,
	LinkOptions,
	MkdirOptions,
	UploadAttributeType,
	UploadOptions,
	UploadStream,
} from "./types.ts";
import { createPromise, detectSize, streamToCb } from "./util.ts";

// metadata can be mutated, not the content
export class MutableFile extends File {
	storage: Storage;
	declare parent?: MutableFile;
	declare children?: MutableFile[];

	constructor(opt: Record<string, any>, storage: Storage) {
		super(opt);

		this.storage = storage;
		this.api = storage.api;
		this.nodeId = opt.h;
		this.timestamp = opt.ts;
		this.type = opt.t;
		this.directory = !!this.type;
		if (this.directory && !this.children) this.children = [];

		if (opt.k) {
			const idKeyPairs: string[] = opt.k.split("/");
			let aes: AES = storage.aes;

			for (const idKeyPair of idKeyPairs) {
				const id = idKeyPair.split(":")[0];
				if (id === storage.user) {
					opt.k = idKeyPair;
					break;
				}
				const shareKey = storage.shareKeys[id];
				if (shareKey) {
					opt.k = idKeyPair;
					let cachedAes = storage.keyCache.get(id);
					if (!cachedAes) {
						cachedAes = new AES(shareKey);
						storage.keyCache.set(id, cachedAes);
					}
					aes = cachedAes;
					break;
				}
			}

			this.loadMetadata(aes, opt);
		}
	}

	override loadAttributes(): Promise<File> {
		throw new Error("This is not needed for files loaded from logged in sessions");
	}

	mkdir(opt: MkdirOptions | string, originalCb?: Callback<MutableFile>): Promise<MutableFile> {
		if (!this.directory) throw new Error("node isn't a directory");

		const [cb, promise] = createPromise(originalCb);
		const options: MkdirOptions = typeof opt === "string" ? { name: opt } : opt;
		if (!options.attributes) options.attributes = {};
		if (options.name) options.attributes.n = options.name;

		if (!options.attributes.n) {
			throw new Error("file name is required");
		}

		if (!options.target) options.target = this;
		let keyBuffer: Buffer;
		if (!options.key) {
			keyBuffer = Buffer.from(crypto.getRandomValues(new Uint8Array(16)));
		} else {
			keyBuffer = Buffer.isBuffer(options.key)
				? options.key
				: Buffer.from(options.key as any);
		}

		if (keyBuffer.length !== 16) {
			throw new Error("wrong key length, must be 128bit");
		}

		const at = MutableFile.packAttributes(options.attributes);
		getCipher(keyBuffer).encryptCBC(at);

		const storedKey = Buffer.from(keyBuffer);
		this.storage.aes.encryptECB(storedKey);

		const targetNodeId =
			typeof options.target === "string"
				? options.target
				: (options.target as MutableFile).nodeId;

		const request: Record<string, any> = {
			a: "p",
			t: targetNodeId,
			n: [
				{
					h: "xxxxxxxx",
					t: 1,
					a: e64(at),
					k: e64(storedKey),
				},
			],
		};

		const shares = getShares(this.storage.shareKeys, this);
		if (shares.length > 0) {
			request.cr = makeCryptoRequest(
				this.storage,
				[
					{
						nodeId: "xxxxxxxx",
						key: keyBuffer,
					},
				],
				shares,
			);
		}

		this.api.request(request, (err, response) => {
			if (err) return cb(err);
			const file = this.storage._importFile(response.f[0]);
			this.storage.emit("add", file);
			cb(null, file);
		});

		return promise;
	}

	upload(
		opt: UploadOptions | string,
		source?: any,
		originalCb?: Callback<MutableFile>,
	): UploadStream {
		if (!this.directory) throw new Error("node is not a directory");
		if (arguments.length === 2 && typeof source === "function") {
			originalCb = source;
			source = null;
		}
		const [cb, promise] = createPromise(originalCb);

		const options: UploadOptions = typeof opt === "string" ? { name: opt } : opt;

		if (!options.attributes) options.attributes = {};
		if (options.name) options.attributes.n = options.name;

		if (!options.attributes.n) {
			throw new Error("File name is required.");
		}

		if (
			!(typeof options.size === "number" && options.size >= 0) &&
			!(source && typeof source.pipe !== "function" && typeof source.length === "number") &&
			!options.allowUploadBuffering
		) {
			throw new Error("Specify a file size or set allowUploadBuffering to true");
		}

		if (!options.target) options.target = this;

		let finalKey: Buffer | undefined;
		let key = formatKey(options.key);
		if (!key) {
			key = Buffer.from(crypto.getRandomValues(new Uint8Array(24)));
		}
		if (!Buffer.isBuffer(key)) {
			key = Buffer.from(key);
		}

		const keySize = options.uploadCiphertext ? 32 : 24;
		if (key.length !== keySize) {
			throw new Error("Wrong key length. Key must be 192bit");
		}

		if (options.uploadCiphertext) {
			finalKey = key;
			key = unmergeKeyMac(key).subarray(0, 24);
		}

		options.key = key;

		const hashes: Buffer[] = [];
		const checkCallbacks = (
			err: Error | null,
			type: number,
			hash?: Buffer,
			encrypter?: any,
		) => {
			if (err) return returnError(err);
			if (!hash || hash.length === 0) {
				returnError(new Error("Server returned a invalid response while uploading"));
				return;
			}

			const errorCheck = Number(hash.toString());
			if (errorCheck < 0) {
				returnError(new Error(`Server returned error ${errorCheck} while uploading`));
				return;
			}

			hashes[type] = hash;
			if (type === 0 && !finalKey) finalKey = encrypter.key;

			if (options.thumbnailImage && !hashes[1]) return;
			if (options.previewImage && !hashes[2]) return;
			if (!hashes[0]) return;

			const at = MutableFile.packAttributes(options.attributes!);
			getCipher(finalKey!).encryptCBC(at);

			const storedKey = Buffer.from(finalKey!);
			this.storage.aes.encryptECB(storedKey);

			const fileObject: Record<string, any> = {
				h: e64(hashes[0]),
				t: 0,
				a: e64(at),
				k: e64(storedKey),
			};

			if (hashes.length !== 1) {
				fileObject.fa = hashes
					.slice(1)
					.map((h, index) => `${index}*${e64(h)}`)
					.filter(Boolean)
					.join("/");
			}

			const targetNodeId =
				typeof options.target === "string"
					? options.target
					: (options.target as MutableFile).nodeId;

			const request: Record<string, any> = {
				a: "p",
				t: targetNodeId,
				n: [fileObject],
			};

			const shares = getShares(this.storage.shareKeys, this);
			if (shares.length > 0) {
				request.cr = makeCryptoRequest(
					this.storage,
					[
						{
							nodeId: fileObject.h,
							key: finalKey!,
						},
					],
					shares,
				);
			}

			this.api.request(request, (reqErr, response) => {
				if (reqErr) return returnError(reqErr);
				const file = this.storage._importFile(response.f[0]);
				this.storage.emit("add", file);
				stream.emit("complete", file);

				cb(null, file);
			});
		};

		if (options.thumbnailImage) {
			this._uploadAttribute(options, options.thumbnailImage, 1, checkCallbacks);
		}
		if (options.previewImage) {
			this._uploadAttribute(options, options.previewImage, 2, checkCallbacks);
		}

		const stream = this._upload(options, source, 0, checkCallbacks);

		function returnError(e: Error) {
			if (stream.listenerCount("error")) {
				stream.emit("error", e);
			} else {
				cb(e);
			}
		}

		(stream as any).complete = promise;
		return stream as any;
	}

	private _upload(
		opt: UploadOptions,
		source: any,
		type: number,
		cb: (err: Error | null, type: number, hash?: Buffer, encrypter?: any) => void,
	): any {
		const encrypter = opt.uploadCiphertext ? new PassThrough() : megaEncrypt(opt.key);

		let stream: any = encrypter;
		let size = opt.size;

		if (source && typeof source.pipe !== "function") {
			size = source.length;
			stream.end(source);
		}

		if (size != null) {
			if (size === 0) encrypter.end();
			this._uploadWithSize(stream, size, encrypter, type, opt, cb);
		} else {
			stream = detectSize(stream, (detectedSize) => {
				this._uploadWithSize(stream, detectedSize, encrypter, type, opt, cb);
			});
		}

		if (source && typeof source.pipe === "function") {
			source.pipe(stream);
		}

		return stream;
	}

	private _uploadAttribute(
		opt: Record<string, any>,
		source: any,
		type: number,
		cb: (err: Error | null, type: number, hash?: Buffer, encrypter?: any) => void,
	): void {
		const gotBuffer = (err: Error | null, buffer?: Buffer) => {
			if (err || !buffer) return cb(err || new Error("Missing buffer"), type);

			const len = buffer.length;
			const rest = Math.ceil(len / 16) * 16 - len;
			let currentBuffer = buffer;

			if (rest !== 0) {
				currentBuffer = Buffer.concat([currentBuffer, Buffer.alloc(rest)]);
			}

			const encrypter = opt.handle ? getCipher(opt.key) : new AES(opt.key.subarray(0, 16));
			encrypter.encryptCBC(currentBuffer);

			const stream = new PassThrough();
			stream.end(currentBuffer);

			this._uploadWithSize(stream, currentBuffer.length, stream, type, opt, cb);
		};

		if (Buffer.isBuffer(source)) {
			gotBuffer(null, source);
			return;
		}

		streamToCb(source, gotBuffer);
	}

	private _uploadWithSize(
		stream: any,
		size: number,
		source: any,
		type: number,
		opt: UploadOptions,
		cb: (err: Error | null, type: number, hash?: Buffer, encrypter?: any) => void,
	): void {
		const ssl = API.handleForceHttps(opt.forceHttps) ? 2 : 0;
		const getUrlRequest: Record<string, any> =
			type === 0
				? { a: "u", ssl, s: size, ms: 0, r: 0, e: 0, v: 2 }
				: { a: "ufa", ssl, s: size };

		if (opt.handle) {
			getUrlRequest.h = opt.handle;
		}

		const initialChunkSize = type === 0 ? opt.initialChunkSize || 128 * 1024 : size;
		const chunkSizeIncrement = opt.chunkSizeIncrement || 128 * 1024;
		const maxChunkSize = opt.maxChunkSize || 1024 * 1024;
		const maxConnections = opt.maxConnections || 4;
		const handleRetries = opt.handleRetries || File.defaultHandleRetries;

		let currentChunkSize = initialChunkSize;
		let activeConnections = 0;
		let isReading = false;
		let position = 0;
		let remainingBuffer: Buffer | null = null;
		let uploadBuffer: Buffer | null = null;
		let uploadURL: string;
		let chunkSize: number;
		let chunkPos: number;
		let bytesUploaded = 0;

		const handleChunk = () => {
			chunkSize = Math.min(currentChunkSize, size - position);
			uploadBuffer = Buffer.allocUnsafe(chunkSize);
			activeConnections++;

			if (currentChunkSize < maxChunkSize) {
				currentChunkSize += chunkSizeIncrement;
			}

			chunkPos = 0;
			if (remainingBuffer) {
				remainingBuffer.copy(uploadBuffer);
				chunkPos = Math.min(remainingBuffer.length, chunkSize);
				remainingBuffer =
					remainingBuffer.length > chunkSize ? remainingBuffer.subarray(chunkSize) : null;
			}

			if (chunkPos === chunkSize) {
				sendChunk();
			} else {
				isReading = true;
				handleData();
			}
		};

		const sendChunk = () => {
			const chunkPosition = position;
			const chunkBuffer = uploadBuffer!;
			let tries = 0;

			const trySendChunk = () => {
				tries++;
				this.api
					.fetch(`${uploadURL}/${type === 0 ? chunkPosition : type - 1}`, {
						method: "POST",
						body: chunkBuffer as any,
						headers: {
							"content-length": chunkBuffer.length.toString(),
						},
					})
					.then((response) => {
						if (response.status !== 200) {
							throw new Error(`MEGA returned a ${response.status} status code`);
						}
						return response.arrayBuffer();
					})
					.then(
						(hash) => {
							activeConnections--;
							bytesUploaded += chunkBuffer.length;
							stream.emit("progress", {
								bytesLoaded: sizeCheck,
								bytesUploaded,
								bytesTotal: size,
							});

							const hashBuffer = Buffer.from(hash);
							if (hashBuffer.length > 0) {
								source.end();
								process.nextTick(() => {
									cb(null, type, hashBuffer, source);
								});
							} else if (position < size && !isReading) {
								handleChunk();
							}
						},
						(error) => {
							handleRetries(tries, error, (retryError) => {
								if (retryError) {
									activeConnections--;
									stream.emit("error", retryError);
								} else {
									trySendChunk();
								}
							});
						},
					);
			};
			trySendChunk();

			uploadBuffer = null;
			position += chunkSize;

			if (position < size && !isReading && activeConnections < maxConnections) {
				handleChunk();
			}
		};

		let sizeCheck = 0;
		const handleData = () => {
			while (true) {
				const data = source.read();
				if (data === null) {
					source.once("readable", handleData);
					break;
				}
				sizeCheck += data.length;

				data.copy(uploadBuffer!, chunkPos);
				chunkPos += data.length;

				if (chunkPos >= chunkSize) {
					isReading = false;
					remainingBuffer = data.subarray(data.length - (chunkPos - chunkSize));
					sendChunk();
					break;
				}
			}
		};

		source.on("end", () => {
			if (size && sizeCheck !== size) {
				stream.emit(
					"error",
					new Error(`Specified data size does not match: ${size} !== ${sizeCheck}`),
				);
			}
		});

		this.api.request(getUrlRequest, (err, resp) => {
			if (err) return cb(err, type);
			uploadURL = resp.p;
			handleChunk();
		});
	}

	uploadAttribute(
		type: UploadAttributeType,
		data: Buffer,
		originalCb?: Callback<this>,
	): Promise<this> {
		const [cb, promise] = createPromise(originalCb);

		let typeIndex: number;
		if (typeof type === "string") {
			typeIndex = (["thumbnail", "preview"] as const).indexOf(type as any);
		} else {
			typeIndex = type;
		}
		if (typeIndex !== 0 && typeIndex !== 1) {
			throw new Error("Invalid attribute type");
		}

		this._uploadAttribute(
			{
				key: this.key,
				handle: this.nodeId,
			},
			data,
			typeIndex + 1,
			(err, _streamType, hash) => {
				if (err) return cb(err);
				const request = {
					a: "pfa",
					n: this.nodeId,
					fa: `${typeIndex}*${e64(hash!)}`,
				};

				this.api.request(request, (reqErr) => {
					if (reqErr) return cb(reqErr);
					cb(null, this);
				});
			},
		);

		return promise;
	}

	delete(permanent?: boolean | Callback, cb?: Callback): Promise<any> {
		if (typeof permanent === "function") {
			cb = permanent;
			permanent = undefined;
		}

		if (typeof permanent === "undefined") {
			permanent = this.parent === this.storage.trash;
		}

		if (permanent) {
			return this.api.request({ a: "d", n: this.nodeId }, cb);
		}
		if (this.storage.trash) {
			return this.moveTo(this.storage.trash, cb);
		}
		return this.api.request({ a: "d", n: this.nodeId }, cb);
	}

	moveTo(target: File | string, cb?: Callback): Promise<any> {
		let targetFile: File | undefined;
		if (typeof target === "string") {
			targetFile = this.storage.files[target];
		} else {
			targetFile = target;
		}

		if (!(targetFile instanceof File)) {
			throw new Error("target must be a folder or a nodeId");
		}

		const request: Record<string, any> = {
			a: "m",
			n: this.nodeId,
			t: targetFile.nodeId,
		};
		const shares = getShares(this.storage.shareKeys, targetFile);
		if (shares.length > 0) {
			request.cr = makeCryptoRequest(this.storage, [this], shares);
		}

		return this.api.request(request, cb);
	}

	copyTo(target: File | string, cb?: Callback): Promise<any> {
		let targetFile: File | undefined;
		if (typeof target === "string") {
			targetFile = this.storage.files[target];
		} else {
			targetFile = target;
		}

		if (!(targetFile instanceof File)) {
			throw new Error("target must be a folder or a nodeId");
		}

		const attributes = MutableFile.packAttributes(this.attributes || {});
		getCipher(this.key!).encryptCBC(attributes);

		const request: Record<string, any> = {
			a: "p",
			sm: 1,
			v: 3,
			t: targetFile.nodeId,
			n: [
				{
					k: e64(this.storage.aes.encryptECB(Buffer.from(this.key!))),
					a: e64(attributes),
					h: this.nodeId,
					t: 0,
				},
			],
		};

		const shares = getShares(this.storage.shareKeys, targetFile);
		if (shares.length > 0) {
			request.cr = makeCryptoRequest(
				this.storage,
				[
					{
						nodeId: this.nodeId!,
						key: this.key!,
					},
				],
				shares,
			);
		}

		return this.api.request(request, cb);
	}

	setAttributes(attributes: Record<string, any>, originalCb?: Callback): Promise<void> {
		const [cb, promise] = createPromise(originalCb);
		Object.assign(this.attributes ?? (this.attributes = {}), attributes);

		const newAttributes = MutableFile.packAttributes(this.attributes);
		getCipher(this.key!).encryptCBC(newAttributes);

		this.api.request({ a: "a", n: this.nodeId, at: e64(newAttributes) }, (error) => {
			this.parseAttributes(this.attributes!);
			cb(error);
		});

		return promise;
	}

	rename(filename: string, cb?: Callback): Promise<void> {
		return this.setAttributes({ n: filename }, cb);
	}

	setLabel(label: LabelType, cb?: Callback): Promise<void> {
		const labelNum: number =
			typeof label === "string" ? (LABEL_NAMES as readonly string[]).indexOf(label) : label;
		if (
			typeof labelNum !== "number" ||
			Math.floor(labelNum) !== labelNum ||
			labelNum < 0 ||
			labelNum > 7
		) {
			throw new Error("label must be a integer between 0 and 7 or a valid label name");
		}

		return this.setAttributes({ lbl: labelNum }, cb);
	}

	setFavorite(isFavorite?: boolean, cb?: Callback): Promise<void> {
		return this.setAttributes({ fav: isFavorite ? 1 : 0 }, cb);
	}

	override link(
		options?: LinkOptions | boolean | Callback<string>,
		originalCb?: Callback<string>,
	): Promise<string> {
		if (typeof options === "function") {
			originalCb = options;
			options = { noKey: false };
		}

		let linkOpts: LinkOptions = {};
		if (typeof options === "boolean") {
			linkOpts = { noKey: options };
		} else if (options) {
			linkOpts = options;
		}

		const folderKey = linkOpts.__folderKey;
		if (this.directory && !folderKey) {
			return this.shareFolder(linkOpts, originalCb);
		}

		const [cb, promise] = createPromise(originalCb);
		this.api.request({ a: "l", n: this.nodeId }, (err, id) => {
			if (err) return cb(err);

			let url = `https://mega.nz/${folderKey ? "folder" : "file"}/${id}`;
			if (!linkOpts.noKey && this.key) {
				url += `#${e64(folderKey || this.key)}`;
			}

			cb(null, url);
		});

		return promise;
	}

	shareFolder(
		options?: LinkOptions | Callback<string>,
		originalCb?: Callback<string>,
	): Promise<string> {
		if (!this.directory) throw new Error("node isn't a folder");

		if (typeof options === "function") {
			originalCb = options;
			options = {};
		}

		const handler = this.nodeId!;
		const storedShareKey = this.storage.shareKeys[handler];
		if (storedShareKey) {
			return this.link(
				{
					__folderKey: storedShareKey,
					...options,
				},
				originalCb,
			);
		}

		let shareKey = formatKey(options?.key);

		if (!shareKey) {
			shareKey = Buffer.from(crypto.getRandomValues(new Uint8Array(16)));
		}

		if (!Buffer.isBuffer(shareKey)) {
			shareKey = Buffer.from(shareKey);
		}

		const [cb, promise] = createPromise(originalCb);
		if (shareKey.length !== 16) {
			process.nextTick(() => {
				cb(new Error("share key must be 16 byte / 22 characters"));
			});
			return promise;
		}

		this.storage.shareKeys[handler] = shareKey;

		const authKey = Buffer.from(handler + handler);
		this.storage.aes.encryptECB(authKey);

		const request = {
			a: "s2",
			n: handler,
			s: [{ u: "EXP", r: 0 }],
			ok: e64(this.storage.aes.encryptECB(Buffer.from(shareKey))),
			ha: e64(authKey),
			cr: makeCryptoRequest(this.storage, this),
		};

		this.api.request(request, (err) => {
			if (err) return cb(err);
			this.link(
				{
					__folderKey: shareKey,
					...options,
				},
				cb,
			);
		});

		return promise;
	}

	unshare(cb?: Callback): Promise<any> {
		if (this.directory) return this.unshareFolder(cb);

		return this.api.request(
			{
				a: "l",
				n: this.nodeId,
				d: 1,
			},
			cb,
		);
	}

	unshareFolder(cb?: Callback): Promise<any> {
		if (!this.directory) throw new Error("node isn't a folder");
		delete this.storage.shareKeys[this.nodeId!];

		return this.api.request(
			{
				a: "s2",
				n: this.nodeId,
				s: [{ u: "EXP", r: "" }],
			},
			cb,
		);
	}

	importFile(
		sharedFile: string | File,
		originalCb?: Callback<MutableFile>,
	): Promise<MutableFile> {
		const [cb, promise] = createPromise(originalCb);

		if (!this.directory) {
			throw new Error("importFile can only be called on directories");
		}
		let fileTarget: File;
		if (typeof sharedFile === "string") {
			fileTarget = File.fromURL(sharedFile);
		} else {
			fileTarget = sharedFile;
		}
		if (!(fileTarget instanceof File)) {
			throw new Error("First argument of importFile should be a File or a URL string");
		}

		if (!fileTarget.key) {
			cb(new Error("Can't import files without encryption keys"));
			return promise;
		}

		const afterGotAttributes = (err: Error | null, file?: File) => {
			if (err || !file) return cb(err || new Error("Failed to get attributes"));

			const attributes = MutableFile.packAttributes(file.attributes || {});
			getCipher(file.key!).encryptCBC(attributes);

			const downloadId = Array.isArray(file.downloadId)
				? file.downloadId[1]
				: file.downloadId;

			const request = {
				a: "p",
				t: this.nodeId,
				n: [
					{
						ph: downloadId,
						t: 0,
						a: e64(attributes),
						k: e64(this.storage.aes.encryptECB(Buffer.from(file.key!))),
					},
				],
			};

			this.api.request(request, (reqErr, response) => {
				if (reqErr) return cb(reqErr);

				const importedFile = this.storage._importFile(response.f[0]);
				this.storage.emit("add", importedFile);

				cb(null, importedFile);
			});
		};

		if (fileTarget.attributes) {
			afterGotAttributes(null, fileTarget);
		} else {
			fileTarget.loadAttributes(afterGotAttributes);
		}

		return promise;
	}

	static packAttributes(attributes: Record<string, any>): Buffer {
		const at = Buffer.from(`MEGA${JSON.stringify(attributes)}`);
		const ret = Buffer.alloc(Math.ceil(at.length / 16) * 16);
		at.copy(ret);
		return ret;
	}
}

// source: https://github.com/meganz/webclient/blob/918222d5e4521c8777b1c8da528f79e0110c1798/js/crypto.js#L3728
function makeCryptoRequest(storage: Storage, sources: any, shares?: string[]): any[] {
	const shareKeys = storage.shareKeys;
	const sourceList: any[] = Array.isArray(sources) ? sources : selfAndChildren(sources);

	if (!shares) {
		shares = sourceList
			.map((source) => getShares(shareKeys, source))
			.reduce((arr, el) => arr.concat(el), [])
			.filter((el: string, index: number, arr: string[]) => index === arr.indexOf(el));
	}

	const cryptoRequest: [string[], string[], Array<number | string>] = [
		shares,
		sourceList.map((node) => node.nodeId),
		[],
	];

	for (let i = shares.length; i--;) {
		const aes = new AES(shareKeys[shares[i]]);

		for (let j = sourceList.length; j--;) {
			const fileKey = Buffer.from(sourceList[j].key);

			if (fileKey && (fileKey.length === 32 || fileKey.length === 16)) {
				cryptoRequest[2].push(i, j, e64(aes.encryptECB(fileKey)));
			}
		}
	}

	return cryptoRequest;
}

function selfAndChildren(node: any): any[] {
	return [node].concat(
		(node.children || [])
			.map(selfAndChildren)
			.reduce((arr: any[], el: any[]) => arr.concat(el), []),
	);
}

function getShares(shareKeys: Record<string, Buffer>, node: any): string[] {
	const handle = node.nodeId;
	const parent = node.parent;
	const shares: string[] = [];

	if (shareKeys[handle]) {
		shares.push(handle);
	}

	return parent ? shares.concat(getShares(shareKeys, parent)) : shares;
}

export default MutableFile;
