/**
 * Decode MPI (Multi-Precision Integer) format from a Buffer into a BigInt and bytes read.
 * MPI: 2 bytes big-endian bit length followed by the big-endian integer payload.
 */
function decodeMpiBigInt(buf: Buffer): [bigint, number] {
	if (buf.length < 2) return [0n, 0];
	const bits = (buf[0] << 8) | buf[1];
	const len = Math.floor((bits + 7) / 8);
	if (buf.length < 2 + len) {
		throw new Error("Invalid MPI length in RSA payload");
	}
	const hex = buf.subarray(2, 2 + len).toString("hex");
	const val = hex ? BigInt(`0x${hex}`) : 0n;
	return [val, 2 + len];
}

/**
 * Modular exponentiation: (base ^ exp) % mod
 */
function modPow(base: bigint, exp: bigint, mod: bigint): bigint {
	let res = 1n;
	let b = base % mod;
	let e = exp;
	while (e > 0n) {
		if (e & 1n) res = (res * b) % mod;
		b = (b * b) % mod;
		e >>= 1n;
	}
	return res;
}

/**
 * RSA CRT Decryption: computes m = c^d mod (p * q)
 * using primes p, q, exponent d, and CRT coefficient u = (p^-1 mod q)
 */
function rsaDecryptCrt(ciphertext: bigint, p: bigint, q: bigint, d: bigint, u: bigint): Buffer {
	const xp = modPow(ciphertext % p, d % (p - 1n), p);
	const xq = modPow(ciphertext % q, d % (q - 1n), q);

	let t = (xq - xp) % q;
	if (t < 0n) t += q;
	t = (t * u) % q;

	const m = xp + t * p;
	let hex = m.toString(16);
	if (hex.length % 2 !== 0) hex = `0${hex}`;
	return Buffer.from(hex, "hex");
}

/**
 * Decomposes an encrypted private key buffer into MPI components [p, q, d, u].
 */
export function cryptoDecodePrivKey(privk: Buffer): bigint[] | false {
	const parts: bigint[] = [];
	let current = privk;

	for (let i = 0; i < 4; i++) {
		if (current.length < 2) return false;
		try {
			const [val, readLen] = decodeMpiBigInt(current);
			parts.push(val);
			current = current.subarray(readLen);
		} catch {
			return false;
		}
	}

	return parts.length === 4 ? parts : false;
}

/**
 * Decrypts an RSA ciphertext using decomposed private key components [p, q, d, u].
 */
export function cryptoRsaDecrypt(ciphertext: Buffer, privkey: bigint[]): Buffer {
	const [p, q, d, u] = privkey;

	const [c] = decodeMpiBigInt(ciphertext);
	return rsaDecryptCrt(c, p, q, d, u);
}
