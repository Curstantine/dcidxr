import crypto from "node:crypto";

// S-box and lookup tables for fast AES-128 key preparation
const SBOX = new Uint8Array(256);
const RCON = new Uint32Array([
	0x01000000, 0x02000000, 0x04000000, 0x08000000, 0x10000000, 0x20000000, 0x40000000, 0x80000000,
	0x1b000000, 0x36000000,
]);

// Initialize SBOX
{
	let p = 1;
	let q = 1;
	do {
		p = p ^ (p << 1) ^ (p & 0x80 ? 0x11b : 0);
		q ^= q << 1;
		q ^= q << 2;
		q ^= q << 4;
		q ^= q & 0x80 ? 0x09 : 0;
		q &= 0xff;
		const xformed =
			q ^
			((q << 1) | (q >> 7)) ^
			((q << 2) | (q >> 6)) ^
			((q << 3) | (q >> 5)) ^
			((q << 4) | (q >> 4)) ^
			0x63;
		SBOX[p] = xformed & 0xff;
	} while (p !== 1);
	SBOX[0] = 0x63;
}

const T0 = new Uint32Array(256);
const T1 = new Uint32Array(256);
const T2 = new Uint32Array(256);
const T3 = new Uint32Array(256);

function rotl(val: number, bits: number): number {
	return (val << bits) | (val >>> (32 - bits));
}

for (let i = 0; i < 256; i++) {
	const s = SBOX[i];
	const s2 = ((s << 1) ^ (s & 0x80 ? 0x11b : 0)) & 0xff;
	const s3 = s2 ^ s;
	const t = (s2 << 24) | (s << 16) | (s << 8) | s3;
	T0[i] = t >>> 0;
	T1[i] = rotl(t, 24) >>> 0;
	T2[i] = rotl(t, 16) >>> 0;
	T3[i] = rotl(t, 8) >>> 0;
}

function expandAesKey(key: Buffer): Uint32Array {
	const w = new Uint32Array(44);
	for (let i = 0; i < 4; i++) {
		w[i] = key.readUInt32BE(i * 4);
	}
	for (let i = 4; i < 44; i++) {
		let temp = w[i - 1];
		if (i % 4 === 0) {
			temp =
				(SBOX[(temp >>> 16) & 0xff] << 24) |
				(SBOX[(temp >>> 8) & 0xff] << 16) |
				(SBOX[temp & 0xff] << 8) |
				SBOX[(temp >>> 24) & 0xff];
			temp ^= RCON[i / 4 - 1];
		}
		w[i] = (w[i - 4] ^ temp) >>> 0;
	}
	return w;
}

function encryptAesBlock(w: Uint32Array, block: Buffer): Buffer {
	let s0 = block.readUInt32BE(0) ^ w[0];
	let s1 = block.readUInt32BE(4) ^ w[1];
	let s2 = block.readUInt32BE(8) ^ w[2];
	let s3 = block.readUInt32BE(12) ^ w[3];

	let k = 4;
	for (let r = 1; r < 10; r++) {
		const t0 =
			T0[s0 >>> 24] ^ T1[(s1 >>> 16) & 0xff] ^ T2[(s2 >>> 8) & 0xff] ^ T3[s3 & 0xff] ^ w[k++];
		const t1 =
			T0[s1 >>> 24] ^ T1[(s2 >>> 16) & 0xff] ^ T2[(s3 >>> 8) & 0xff] ^ T3[s0 & 0xff] ^ w[k++];
		const t2 =
			T0[s2 >>> 24] ^ T1[(s3 >>> 16) & 0xff] ^ T2[(s0 >>> 8) & 0xff] ^ T3[s1 & 0xff] ^ w[k++];
		const t3 =
			T0[s3 >>> 24] ^ T1[(s0 >>> 16) & 0xff] ^ T2[(s1 >>> 8) & 0xff] ^ T3[s2 & 0xff] ^ w[k++];
		s0 = t0 >>> 0;
		s1 = t1 >>> 0;
		s2 = t2 >>> 0;
		s3 = t3 >>> 0;
	}

	const out = Buffer.allocUnsafe(16);
	out.writeInt32BE(
		((SBOX[s0 >>> 24] << 24) |
			(SBOX[(s1 >>> 16) & 0xff] << 16) |
			(SBOX[(s2 >>> 8) & 0xff] << 8) |
			SBOX[s3 & 0xff]) ^
			w[40],
		0,
	);
	out.writeInt32BE(
		((SBOX[s1 >>> 24] << 24) |
			(SBOX[(s2 >>> 16) & 0xff] << 16) |
			(SBOX[(s3 >>> 8) & 0xff] << 8) |
			SBOX[s0 & 0xff]) ^
			w[41],
		4,
	);
	out.writeInt32BE(
		((SBOX[s2 >>> 24] << 24) |
			(SBOX[(s3 >>> 16) & 0xff] << 16) |
			(SBOX[(s0 >>> 8) & 0xff] << 8) |
			SBOX[s1 & 0xff]) ^
			w[42],
		8,
	);
	out.writeInt32BE(
		((SBOX[s3 >>> 24] << 24) |
			(SBOX[(s0 >>> 16) & 0xff] << 16) |
			(SBOX[(s1 >>> 8) & 0xff] << 8) |
			SBOX[s2 & 0xff]) ^
			w[43],
		12,
	);
	return out;
}

// convert user-supplied password array with fast key schedule & inlined block cipher
export function prepareKey(password: Buffer): Buffer {
	let pkey: Buffer = Buffer.from([
		147, 196, 103, 227, 125, 176, 199, 164, 209, 190, 63, 129, 1, 82, 203, 86,
	]);

	const subkeys: Uint32Array[] = [];
	for (let j = 0; j < password.length; j += 16) {
		const key = Buffer.alloc(16);
		for (let i = 0; i < 16; i += 4) {
			if (i + j < password.length) {
				password.copy(key, i, i + j, i + j + 4);
			}
		}
		subkeys.push(expandAesKey(key));
	}

	for (let r = 65536; r--;) {
		for (let j = 0; j < subkeys.length; j++) {
			pkey = encryptAesBlock(subkeys[j], pkey);
		}
	}

	return pkey;
}

// The same function but for version 2 accounts
export function prepareKeyV2(
	password: Buffer,
	info: { s: string },
	cb: (error: Error | null, derivedKey?: Buffer) => void,
): void {
	const salt = Buffer.from(info.s, "base64");
	const iterations = 100000;
	const digest = "sha512";

	crypto.pbkdf2(password, salt, iterations, 32, digest, cb);
}

export class AES {
	key: Buffer;

	constructor(key: Buffer) {
		if (key.length !== 16) {
			throw new Error("Wrong key length. Key must be 128bit.");
		}
		this.key = key;
	}

	encryptCBC(buffer: Buffer): Buffer {
		const iv = Buffer.alloc(16, 0);
		const cipher = crypto.createCipheriv("aes-128-cbc", this.key, iv).setAutoPadding(false);

		const result = Buffer.concat([cipher.update(buffer), cipher.final()]);
		result.copy(buffer);
		return result;
	}

	decryptCBC(buffer: Buffer): Buffer {
		const iv = Buffer.alloc(16, 0);
		const decipher = crypto.createDecipheriv("aes-128-cbc", this.key, iv).setAutoPadding(false);

		const result = Buffer.concat([decipher.update(buffer), decipher.final()]);
		result.copy(buffer);
		return result;
	}

	stringhash(buffer: Buffer): Buffer {
		const h32 = [0, 0, 0, 0];
		for (let i = 0; i < buffer.length; i += 4) {
			if (buffer.length - i < 4) {
				const len = buffer.length - i;
				h32[(i / 4) & 3] ^= buffer.readIntBE(i, len) << ((4 - len) * 8);
			} else {
				h32[(i / 4) & 3] ^= buffer.readInt32BE(i);
			}
		}

		let hash = Buffer.allocUnsafe(16);
		for (let i = 0; i < 4; i++) {
			hash.writeInt32BE(h32[i], i * 4);
		}

		const cipher = crypto.createCipheriv("aes-128-ecb", this.key, Buffer.alloc(0));
		for (let i = 16384; i--;) {
			hash = cipher.update(hash);
		}

		const result = Buffer.allocUnsafe(8);
		hash.copy(result, 0, 0, 4);
		hash.copy(result, 4, 8, 12);
		return result;
	}

	encryptECB(buffer: Buffer): Buffer {
		const cipher = crypto
			.createCipheriv("aes-128-ecb", this.key, Buffer.alloc(0))
			.setAutoPadding(false);

		const result = cipher.update(buffer);
		result.copy(buffer);
		return result;
	}

	decryptECB(buffer: Buffer): Buffer {
		const decipher = crypto
			.createDecipheriv("aes-128-ecb", this.key, Buffer.alloc(0))
			.setAutoPadding(false);

		const result = decipher.update(buffer);
		result.copy(buffer);
		return result;
	}
}

export class CTR {
	key: Buffer;
	nonce: Buffer;
	encrypt: (buffer: Buffer) => Buffer;
	decrypt: (buffer: Buffer) => Buffer;
	private encryptCipher?: crypto.Cipheriv;
	private decryptCipher?: crypto.Decipheriv;

	constructor(aes: AES, nonce: Buffer, start = 0) {
		this.key = aes.key;
		this.nonce = nonce.subarray(0, 8);

		const iv = Buffer.alloc(16);
		this.nonce.copy(iv, 0);

		if (start !== 0) {
			this.incrementCTRBuffer(iv, start / 16);
		}

		// create ciphers on demand
		this.encrypt = (buffer: Buffer) => {
			this.encryptCipher = crypto.createCipheriv("aes-128-ctr", this.key, iv);
			this.encrypt = this._encrypt;
			return this.encrypt(buffer);
		};

		this.decrypt = (buffer: Buffer) => {
			this.decryptCipher = crypto.createDecipheriv("aes-128-ctr", this.key, iv);
			this.decrypt = this._decrypt;
			return this.decrypt(buffer);
		};
	}

	private _encrypt(buffer: Buffer): Buffer {
		this.encryptCipher!.update(buffer).copy(buffer);
		return buffer;
	}

	private _decrypt(buffer: Buffer): Buffer {
		this.decryptCipher!.update(buffer).copy(buffer);
		return buffer;
	}

	// From https://github.com/jrnewell/crypto-aes-ctr/blob/77156490fcf32870215680c8db035c01390144b2/lib/index.js#L4-L18
	incrementCTRBuffer(buf: Buffer, cnt: number): void {
		const len = buf.length;
		let i = len - 1;
		let count = cnt;
		while (count !== 0) {
			const mod = (count + buf[i]) % 256;
			count = Math.floor((count + buf[i]) / 256);
			buf[i] = mod;
			i -= 1;
			if (i < 0) {
				i = len - 1;
			}
		}
	}
}

// MEGA's MAC implementation is similar to ECBC-MAC
export class MAC {
	key: Buffer;
	nonce: Buffer;
	macCipher: crypto.Cipheriv;
	posNext: number;
	increment: number;
	pos: number;
	macs: Buffer[];
	mac?: Buffer;

	constructor(aes: AES, nonce: Buffer) {
		this.key = aes.key;
		this.nonce = nonce.subarray(0, 8);
		this.macCipher = crypto.createCipheriv("aes-128-ecb", this.key, Buffer.alloc(0));

		this.posNext = this.increment = 131072; // 2**17
		this.pos = 0;

		this.macs = [];
		this.mac = Buffer.alloc(16);
		this.nonce.copy(this.mac, 0);
		this.nonce.copy(this.mac, 8);
	}

	condense(): Buffer {
		if (this.mac) {
			this.macs.push(this.mac);
			this.mac = undefined;
		}

		let mac = Buffer.alloc(16, 0);

		for (const item of this.macs) {
			for (let j = 0; j < 16; j++) {
				mac[j] ^= item[j];
			}
			mac = this.macCipher.update(mac);
		}

		const macBuffer = Buffer.allocUnsafe(8);
		macBuffer.writeInt32BE(mac.readInt32BE(0) ^ mac.readInt32BE(4), 0);
		macBuffer.writeInt32BE(mac.readInt32BE(8) ^ mac.readInt32BE(12), 4);
		return macBuffer;
	}

	update(buffer: Buffer): void {
		for (let i = 0; i < buffer.length; i += 16) {
			for (let j = 0; j < 16; j++) {
				this.mac![j] ^= buffer[i + j];
			}
			this.mac = this.macCipher.update(this.mac!);
			this.checkBounding();
		}
	}

	private checkBounding(): void {
		this.pos += 16;
		if (this.pos >= this.posNext) {
			this.macs.push(Buffer.from(this.mac!));
			this.nonce.copy(this.mac!, 0);
			this.nonce.copy(this.mac!, 8);

			if (this.increment < 1048576) {
				this.increment += 131072;
			}
			this.posNext += this.increment;
		}
	}
}
