import type { Agent as HttpAgent } from "node:http";
import type { Agent as HttpsAgent } from "node:https";
import type { Readable, Transform, Writable } from "node:stream";
import type { API } from "./api.ts";
import type { MutableFile } from "./mutable-file.ts";

export type LabelType =
	| 0
	| 1
	| 2
	| 3
	| 4
	| 5
	| 6
	| 7
	| ""
	| "red"
	| "orange"
	| "yellow"
	| "green"
	| "blue"
	| "purple"
	| "grey";

export type StorageStatus = "ready" | "connecting" | "closed";

export type UploadAttributeType = 0 | 1 | "thumbnail" | "preview";

export type Callback<T = any> = (error: Error | null, result?: T) => void;

export type BufferString = Buffer | string;

export type Nullable<T> = T | null;

export interface StorageOptions extends APIOptions {
	email?: string;
	password?: BufferString;
	secondFactorCode?: string;
	autoload?: boolean;
	autologin?: boolean;
	keepalive?: boolean;
}

export interface StorageJSON {
	key: string;
	sid: string;
	name: string;
	user: string;
	options: StorageOptions;
}

export interface APIOptions {
	fetch?: typeof fetch;
	gateway?: string;
	httpAgent?: HttpAgent | null;
	httpsAgent?: HttpsAgent | null;
	userAgent?: Nullable<string>;
}

export interface FileOptions {
	api?: API;
	key?: Nullable<BufferString>;
	directory?: boolean;
	downloadId?: string | [string, string];
	loadedFile?: string;
	h?: string;
	ts?: number;
	t?: number;
	k?: string;
	a?: string;
	s?: number;
	u?: string;
	p?: string;
	[key: string]: any;
}

export interface AccountInfo {
	type: string;
	spaceUsed: number;
	spaceTotal: number;
	downloadBandwidthUsed: number;
	downloadBandwidthTotal: number;
	sharedBandwidthUsed: number;
	sharedBandwidthLimit: number;
}

export interface MkdirOptions {
	name?: string;
	key?: BufferString;
	attributes?: Record<string, any>;
	target?: MutableFile | string;
}

export interface UploadOptions {
	name?: string;
	key?: BufferString;
	size?: number;
	maxChunkSize?: number;
	maxConnections?: number;
	initialChunkSize?: number;
	chunkSizeIncrement?: number;
	previewImage?: Buffer | Readable;
	thumbnailImage?: Buffer | Readable;
	allowUploadBuffering?: boolean;
	uploadCiphertext?: boolean;
	forceHttps?: boolean;
	handleRetries?: (tries: number, error: Error | null, cb: (err?: Error | null) => void) => void;
	target?: MutableFile | string;
	attributes?: Record<string, any>;
	handle?: string;
}

export interface CryptOptions {
	start?: number;
	disableVerification?: boolean;
}

export interface LinkOptions {
	noKey?: boolean;
	key?: BufferString;
	__folderKey?: Buffer;
}

export interface MetaOptions {
	k: string;
	t: number;
	s?: number;
	ts?: number;
	a?: BufferString;
	u?: string;
}

export interface DownloadOptions {
	end?: number;
	start?: number;
	forceHttps?: boolean;
	maxChunkSize?: number;
	maxConnections?: number;
	initialChunkSize?: number;
	returnCiphertext?: boolean;
	chunkSizeIncrement?: number;
	handleRetries?: (tries: number, error: Error | null, cb: (err?: Error | null) => void) => void;
}

export interface UploadStream extends Writable {
	complete: Promise<MutableFile>;
	on: ((event: string, listener: (...args: any[]) => void) => this) &
		((event: "complete", listener: (file: MutableFile) => void) => this);
	once: ((event: string, listener: (...args: any[]) => void) => this) &
		((event: "complete", listener: (file: MutableFile) => void) => this);
}

export interface EncryptStream extends Transform {
	key?: Buffer;
	mac?: Buffer;
}

export interface DecryptStream extends Transform {
	mac?: Buffer;
}

export interface VerifyStream extends Transform {
	mac?: Buffer;
}
