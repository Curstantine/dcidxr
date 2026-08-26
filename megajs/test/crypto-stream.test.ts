import assert from "node:assert/strict";
import test from "node:test";

import { decrypt as megaDecrypt, encrypt as megaEncrypt } from "../src/index.ts";
import { sha1, stream2promise, testBuffer } from "./helpers/test-utils.ts";

test("MEGA encrypt/decrypt streams", async () => {
	const size = 151511;
	const d0 = testBuffer(size);
	const d0e = Buffer.from(d0);
	const d0sha = sha1(d0e);
	const key = testBuffer(24, 100, 7);
	const encrypt = megaEncrypt(key);
	let buffer: Buffer;

	encrypt.write(d0e.subarray(0, 50000));
	encrypt.write(d0e.subarray(50000, 100000));
	encrypt.end(d0e.subarray(100000, size));

	buffer = await stream2promise(encrypt);
	assert.strictEqual(
		encrypt.key.toString("hex"),
		"b0b0909070707093e957d163217c2f3fd4dbe2e9f0f7fe0675f47bd299c3e9f2",
	);
	assert.strictEqual(sha1(buffer), "addb96c07ac4e6b66316b81530256c911b0b49d1");

	// Correct decrypt.
	const decryptPass = megaDecrypt(encrypt.key);
	decryptPass.end(buffer);

	buffer = await stream2promise(decryptPass);
	assert.strictEqual(sha1(buffer), d0sha);

	// Invalid mac.
	const k2 = Buffer.from(encrypt.key);
	k2[15] = ~k2[15]; // flip one mac byte.

	try {
		const decryptFail = megaDecrypt(k2);
		decryptFail.end(buffer);
		await stream2promise(decryptFail);

		throw new Error("Stream resolved instead of throwing");
	} catch (error: any) {
		assert.strictEqual(error.message, "MAC verification failed");
	}
});

test("MEGA mid-stream decrypt", async () => {
	const chunkSize = 1024;
	const d0 = testBuffer(chunkSize);
	const d0e = Buffer.from(d0);

	const chunks = 1024;
	const testChunkSize = 128;
	const start = (chunks + 1) * chunkSize - testChunkSize;

	const encrypt = megaEncrypt();

	for (let i = 0; i < chunks; i++) {
		encrypt.write(d0e);
	}

	encrypt.end(Buffer.from(d0));

	const buffer = await stream2promise(encrypt);

	const decryptPass = megaDecrypt(encrypt.key, { start });
	decryptPass.end(buffer.subarray(start));

	const decryptBuffer = await stream2promise(decryptPass);
	const expected = d0.subarray(chunkSize - testChunkSize).toString("hex");
	const got = decryptBuffer.toString("hex");
	assert.strictEqual(expected, got);
});

test("Should not accept wrong key sizes", () => {
	assert.throws(() => megaEncrypt(Buffer.alloc(10)), {
		message: "Wrong key length. Key must be 192bit.",
	});
});
