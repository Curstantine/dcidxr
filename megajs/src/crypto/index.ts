import crypto from "node:crypto";
import stream, { Transform, type Duplex } from "node:stream";

import type { CryptOptions } from "../types.ts";
import { chunkSizeSafe } from "../util.ts";
import { AES, CTR, MAC, prepareKey, prepareKeyV2 } from "./aes.ts";

export { AES, CTR, MAC, prepareKey, prepareKeyV2 };

const compose = (stream as any).compose as (...streams: any[]) => Duplex;

export function formatKey(key: Buffer | string | null | undefined): Buffer | null {
	if (!key) return null;
	return typeof key === "string" ? d64(key) : key;
}

// URL Safe Base64 encode/decode
export function e64(buffer: Buffer): string {
	return buffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

export function d64(s: string): Buffer {
	return Buffer.from(s, "base64");
}

export function getCipher(key: Buffer): AES {
	return new AES(unmergeKeyMac(key).subarray(0, 16));
}

export function megaEncrypt(
	keyInput?: Buffer | string | null,
	options: CryptOptions = {},
): Duplex & { key: Buffer; mac: Buffer } {
	const start = options.start ?? 0;
	if (start !== 0) {
		throw new Error("Encryption cannot start midstream otherwise MAC verification will fail.");
	}
	let key = formatKey(keyInput);

	if (!key) {
		key = Buffer.from(crypto.getRandomValues(new Uint8Array(24)));
	}
	if (!Buffer.isBuffer(key)) {
		key = Buffer.from(key);
	}

	if (key.length !== 24) {
		throw new Error("Wrong key length. Key must be 192bit.");
	}

	const aes = new AES(key.subarray(0, 16));
	const ctr = new CTR(aes, key.subarray(16), start);
	const mac = new MAC(aes, key.subarray(16));

	const transformStream = new Transform({
		transform(chunk: Buffer, _encoding, callback) {
			mac.update(chunk);
			const data = ctr.encrypt(chunk);
			callback(null, Buffer.from(data));
		},
		flush(callback) {
			const condensed = mac.condense();
			(this as any).mac = condensed;
			(this as any).key = mergeKeyMac(key!, condensed);
			callback();
		},
	});

	const composedStream = compose(chunkSizeSafe(16), transformStream) as any;
	Object.defineProperty(composedStream, "mac", {
		get: () => (transformStream as any).mac,
		enumerable: true,
	});
	Object.defineProperty(composedStream, "key", {
		get: () => (transformStream as any).key,
		enumerable: true,
	});

	return composedStream;
}

export function megaDecrypt(
	keyInput: Buffer | string,
	options: CryptOptions = {},
): Duplex & { mac?: Buffer } {
	const start = options.start ?? 0;
	if (start !== 0) options.disableVerification = true;
	if (start % 16 !== 0) {
		throw new Error("start argument of megaDecrypt must be a multiple of 16");
	}
	let key = formatKey(keyInput);
	if (!key || !Buffer.isBuffer(key)) {
		key = Buffer.from(key ?? "");
	}

	const aes = getCipher(key);
	const ctr = new CTR(aes, key.subarray(16), start);
	const mac = !options.disableVerification ? new MAC(aes, key.subarray(16)) : null;

	const transformStream = new Transform({
		transform(chunk: Buffer, _encoding, callback) {
			const data = ctr.decrypt(chunk);
			if (mac) mac.update(data);
			callback(null, Buffer.from(data));
		},
		flush(callback) {
			if (mac) {
				(this as any).mac = mac.condense();
			}
			if (!options.disableVerification && !(this as any).mac.equals(key!.subarray(24))) {
				callback(new Error("MAC verification failed"));
				return;
			}
			callback();
		},
	});

	const composedStream = compose(chunkSizeSafe(16), transformStream) as any;
	Object.defineProperty(composedStream, "mac", {
		get: () => (transformStream as any).mac,
		enumerable: true,
	});

	return composedStream;
}

export function megaVerify(keyInput: Buffer | string): Duplex & { mac: Buffer } {
	let key = formatKey(keyInput);
	if (!key || !Buffer.isBuffer(key)) {
		key = Buffer.from(key ?? "");
	}

	if (key.length !== 32) {
		throw new Error("Wrong key length. Key must be 256bit.");
	}

	const aes = getCipher(key);
	const mac = new MAC(aes, key.subarray(16));

	const transformStream = new Transform({
		transform(chunk: Buffer, _encoding, callback) {
			mac.update(chunk);
			callback(null);
		},
		flush(callback) {
			(this as any).mac = mac.condense();
			if (!(this as any).mac.equals(key!.subarray(24))) {
				callback(new Error("MAC verification failed"));
				return;
			}
			callback();
		},
	});

	const composedStream = compose(chunkSizeSafe(16), transformStream) as any;
	Object.defineProperty(composedStream, "mac", {
		get: () => (transformStream as any).mac,
		enumerable: true,
	});

	return composedStream;
}

export function unmergeKeyMac(key: Buffer): Buffer {
	const newKey = Buffer.alloc(32);
	key.copy(newKey);

	for (let i = 0; i < 16; i++) {
		newKey.writeUInt8(newKey.readUInt8(i) ^ newKey.readUInt8(16 + i), i);
	}

	return newKey;
}

export function mergeKeyMac(key: Buffer, mac: Buffer): Buffer {
	const newKey = Buffer.alloc(32);
	key.copy(newKey);
	mac.copy(newKey, 24);

	for (let i = 0; i < 16; i++) {
		newKey.writeUInt8(newKey.readUInt8(i) ^ newKey.readUInt8(16 + i), i);
	}

	return newKey;
}

export function constantTimeCompare(bufferA: Buffer, bufferB: Buffer): boolean {
	if (bufferA.length !== bufferB.length) return false;
	return crypto.timingSafeEqual(bufferA, bufferB);
}

export async function generateHashcashToken(challenge: string): Promise<string> {
	const [versionStr, easinessStr, , tokenStr] = challenge.split(":");
	const version = Number(versionStr);
	if (version !== 1) throw new Error("hashcash challenge is not version 1");

	const easiness = Number(easinessStr);
	const base = ((easiness & 63) << 1) + 1;
	const shifts = (easiness >> 6) * 7 + 3;
	const threshold = base << shifts;
	const token = d64(tokenStr);

	const buffer = Buffer.alloc(4 + 262144 * 48);
	for (let i = 0; i < 262144; i++) {
		buffer.set(token, 4 + i * 48);
	}

	while (true) {
		const digest = crypto.createHash("sha256").update(buffer).digest();
		if (digest.readUInt32BE(0) <= threshold) {
			return `1:${tokenStr}:${e64(buffer.subarray(0, 4))}`;
		}

		let j = 0;
		while (true) {
			buffer[j]++;
			if (buffer[j++]) break;
		}
	}
}
