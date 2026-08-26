import { EventEmitter } from "node:events";

import API from "./api.ts";
import {
	AES,
	constantTimeCompare,
	d64,
	e64,
	formatKey,
	prepareKey,
	prepareKeyV2,
} from "./crypto/index.ts";
import { cryptoDecodePrivKey, cryptoRsaDecrypt } from "./crypto/rsa.ts";
import type { File } from "./file.ts";
import MutableFile from "./mutable-file.ts";
import type {
	AccountInfo,
	Callback,
	MkdirOptions,
	StorageJSON,
	StorageOptions,
	StorageStatus,
	UploadOptions,
	UploadStream,
} from "./types.ts";
import { createPromise } from "./util.ts";

const NODE_TYPE_DRIVE = 2;
const NODE_TYPE_INBOX = 3;
const NODE_TYPE_RUBBISH_BIN = 4;

export class Storage extends EventEmitter {
	api: API;
	files: Record<string, MutableFile>;
	options: StorageOptions;
	status: StorageStatus;
	mounts: MutableFile[];
	shareKeys: Record<string, Buffer>;
	keyCache: Map<string, AES>;
	root?: MutableFile;
	trash?: MutableFile;
	inbox?: MutableFile;
	name?: string;
	user?: string;
	email?: string;
	key?: Buffer;
	aes!: AES;
	sid?: string;
	RSAPrivateKey?: bigint[];
	ready: Promise<this>;
	private scListenerAttached = false;

	constructor(options?: StorageOptions | Callback<Storage>, originalCb?: Callback<Storage>) {
		super();

		let opts: StorageOptions;
		if (typeof options === "function") {
			originalCb = options;
			opts = {};
		} else {
			opts = options ? { ...options } : {};
		}

		const [cb, promise] = createPromise(originalCb);
		this.ready = promise as Promise<this>;

		opts.keepalive = opts.keepalive === undefined ? true : !!opts.keepalive;
		opts.autoload = opts.autoload === undefined ? true : !!opts.autoload;
		opts.autologin = opts.autologin === undefined ? true : !!opts.autologin;

		this.api = new API(opts.keepalive, opts);
		this.files = {};
		this.options = opts;
		this.status = "closed";
		this.mounts = [];
		this.shareKeys = {};
		this.keyCache = new Map();

		this._setupScListener();

		if (opts.autologin) {
			this.login(cb as any);
		} else {
			process.nextTick(() => {
				cb(null, this);
			});
		}
	}

	private _setupScListener(): void {
		if (this.scListenerAttached) return;
		this.scListenerAttached = true;

		this.api.on("sc", (arr: any[]) => {
			const deleted: Record<string, boolean> = {};
			arr.forEach((o) => {
				if (o.a === "u") {
					const file = this.files[o.n];
					if (file) {
						file.timestamp = o.ts;
						file.decryptAttributes(o.at);
						file.emit("update");
						this.emit("update", file);
					}
				} else if (o.a === "d") {
					deleted[o.n] = true;
				} else if (o.a === "t") {
					o.t.f.forEach((f: any) => {
						const file = this.files[f.h];
						if (file) {
							delete deleted[f.h];
							const oldparent = file.parent;
							if (oldparent?.nodeId === f.p) return;
							if (oldparent?.children) {
								oldparent.children.splice(oldparent.children.indexOf(file), 1);
							}
							file.parent = this.files[f.p];
							file.parent?.children?.push(file);
							file.emit("move", oldparent);
							this.emit("move", file, oldparent);
						} else {
							this.emit("add", this._importFile(f));
						}
					});
				}
			});

			Object.keys(deleted).forEach((n) => {
				const file = this.files[n];
				if (file?.parent?.children) {
					file.parent.children.splice(file.parent.children.indexOf(file), 1);
				}
				this.emit("delete", file);
				file?.emit("delete");
			});
		});
	}

	login(originalCb?: Callback<this>): Promise<this> {
		const [cb, promise] = createPromise(originalCb);

		if (typeof this.options.email !== "string") {
			process.nextTick(() => {
				cb(new Error("starting a session without credentials isn't supported"));
			});
			return promise;
		}

		const ready = () => {
			this.status = "ready";
			cb(null, this);
			this.emit("ready", this);
		};

		const loadUser = (userCb: (err: Error | null, res?: any) => void) => {
			this.api.request({ a: "ug" }, (err, response) => {
				if (err) return userCb(err);
				this.name = response.name;
				this.user = response.u;

				if (this.options.autoload) {
					this.reload(true, (reloadErr) => {
						if (reloadErr) return userCb(reloadErr);
						ready();
					});
				} else {
					ready();
				}
			});
		};

		// MEGA lower cases email addresses (issue #40)
		this.email = this.options.email.toLowerCase();

		const handleV1Account = () => {
			const pw = prepareKey(Buffer.from(this.options.password!));

			const aes = new AES(pw);
			const uh = e64(aes.stringhash(Buffer.from(this.email!)));
			const request: Record<string, any> = { a: "us", user: this.email, uh };
			finishLogin(request, aes);
		};

		const handleV2Account = (info: any) => {
			prepareKeyV2(Buffer.from(this.options.password!), info, (err, result) => {
				if (err || !result) {
					return cb(err || new Error("Failed to prepare key"));
				}

				const aes = new AES(result.subarray(0, 16));
				const uh = e64(result.subarray(16));
				const request: Record<string, any> = {
					a: "us",
					user: this.email,
					uh,
				};
				finishLogin(request, aes);
			});
		};

		const finishLogin = (request: Record<string, any>, aes: AES) => {
			delete this.options.password;

			if (this.options.secondFactorCode) {
				request.mfa = this.options.secondFactorCode.toString();
			}

			this.api.request(request, (err, response) => {
				if (err) return cb(err);
				const formattedKey = formatKey(response.k);
				if (!formattedKey) return cb(new Error("Missing key in response"));
				this.key = formattedKey;
				aes.decryptECB(this.key);
				this.aes = new AES(this.key);

				const t = formatKey(response.csid)!;
				const privk = this.aes.decryptECB(formatKey(response.privk)!);
				const rsaPrivk = cryptoDecodePrivKey(privk);
				if (!rsaPrivk) {
					return cb(new Error("invalid credentials"));
				}

				const sid = e64(cryptoRsaDecrypt(t, rsaPrivk).subarray(0, 43));

				this.api.sid = this.sid = sid;
				this.RSAPrivateKey = rsaPrivk;

				loadUser(cb);
			});
		};

		this.api.request({ a: "us0", user: this.email }, (err, response) => {
			if (err) return cb(err);
			if (response.v === 1) return handleV1Account();
			if (response.v === 2) return handleV2Account(response);
			cb(new Error("Account version not supported"));
		});

		this.status = "connecting";
		return promise;
	}

	reload(
		force?: boolean | Callback<MutableFile[]>,
		originalCb?: Callback<MutableFile[]>,
	): Promise<MutableFile[]> {
		if (typeof force === "function") {
			originalCb = force;
			force = undefined;
		}
		const [cb, promise] = createPromise(originalCb);

		if (this.status === "connecting" && !force) {
			this.once("ready", () => {
				this.reload(force, cb);
			});
			return promise;
		}

		this.mounts = [];
		this.api.request({ a: "f", c: 1 }, (err, response) => {
			if (err) return cb(err);

			this.shareKeys = (response.ok || []).reduce(
				(shares: Record<string, Buffer>, share: any) => {
					const handler = share.h;
					const auth = this.aes.encryptECB(Buffer.from(handler + handler));

					if (constantTimeCompare(formatKey(share.ha)!, auth)) {
						shares[handler] = this.aes.decryptECB(formatKey(share.k)!);
					}

					return shares;
				},
				{},
			);

			for (const fileData of response.f || []) {
				const file = this._importFile(fileData);

				if (response.ph !== undefined) {
					file.shareId = response.ph.find((item: any) => item.h === file.nodeId)?.ph;
					file.shared = !!file.shareId;

					if (file.shared) {
						file.shareURL = `https://mega.nz/${file.directory ? "folder" : "file"}/${file.shareId}`;
						const key = file.directory ? this.shareKeys[file.nodeId!] : file.key;
						if (key) file.shareURL += `#${e64(key)}`;
					}
				}
			}
			cb(null, this.mounts);
		});

		return promise;
	}

	_importFile(f: any): MutableFile {
		if (!this.files[f.h]) {
			const file = (this.files[f.h] = new MutableFile(f, this));
			if (f.t === NODE_TYPE_DRIVE) {
				this.root = file;
				file.name = "Cloud Drive";
			}
			if (f.t === NODE_TYPE_RUBBISH_BIN) {
				this.trash = file;
				file.name = "Rubbish Bin";
			}
			if (f.t === NODE_TYPE_INBOX) {
				this.inbox = file;
				file.name = "Inbox";
			}
			if (f.t > 1) {
				this.mounts.push(file);
			}
			if (f.p) {
				const parent = this.files[f.p];
				if (parent) {
					if (!parent.children) parent.children = [];
					parent.children.push(file);
					file.parent = parent;
				}
			}
		}
		return this.files[f.h];
	}

	mkdir(opt: MkdirOptions | string, cb?: Callback<MutableFile>): Promise<MutableFile> {
		if (this.status !== "ready" || !this.root) {
			throw new Error("storage is not ready");
		}
		return this.root.mkdir(opt, cb);
	}

	upload(opt: UploadOptions | string, buffer?: any, cb?: Callback<MutableFile>): UploadStream {
		if (this.status !== "ready" || !this.root) {
			throw new Error("storage is not ready");
		}
		return this.root.upload(opt, buffer, cb);
	}

	find(query: string | string[] | ((file: File) => boolean), deep?: boolean): File | null {
		if (this.status !== "ready" || !this.root) {
			throw new Error("storage is not ready");
		}
		return this.root.find(query, deep);
	}

	filter(query: string | string[] | ((file: File) => boolean), deep?: boolean): File[] {
		if (this.status !== "ready" || !this.root) {
			throw new Error("storage is not ready");
		}
		return this.root.filter(query, deep);
	}

	navigate(query: string | string[], _deep?: boolean): File | undefined {
		if (this.status !== "ready" || !this.root) {
			throw new Error("storage is not ready");
		}
		return this.root.navigate(query);
	}

	close(cb?: Callback): Promise<any> {
		this.status = "closed";
		this.api.close();
		return this.api.request({ a: "sml" }, cb);
	}

	getAccountInfo(originalCb?: Callback<AccountInfo>): Promise<AccountInfo> {
		const [cb, promise] = createPromise(originalCb);

		this.api.request({ a: "uq", strg: 1, xfer: 1, pro: 1 }, (err, response) => {
			if (err) return cb(err);
			const account: AccountInfo = {
				type: response.utype,
				spaceUsed: response.cstrg,
				spaceTotal: response.mstrg,
				downloadBandwidthTotal: response.mxfer || 1024 ** 5 * 10,
				downloadBandwidthUsed: response.caxfer || 0,
				sharedBandwidthUsed: response.csxfer || 0,
				sharedBandwidthLimit: response.srvratio,
			};

			cb(null, account);
		});

		return promise;
	}

	toJSON(): StorageJSON {
		return {
			key: this.key ? e64(this.key) : "",
			sid: this.sid || "",
			name: this.name || "",
			user: this.user || "",
			options: this.options,
		};
	}

	static fromJSON(json: StorageJSON): Storage {
		const storage = new Storage({
			...json.options,
			autoload: false,
			autologin: false,
		});

		storage.key = d64(json.key);
		storage.aes = new AES(storage.key);
		storage.api.sid = storage.sid = json.sid;
		storage.name = json.name;
		storage.user = json.user;

		return storage;
	}

	decryptRsaKey(ciphertext: Buffer): Buffer {
		if (!this.RSAPrivateKey) {
			throw new Error("Missing RSA private key");
		}
		return cryptoRsaDecrypt(ciphertext, this.RSAPrivateKey);
	}
}

export default Storage;
