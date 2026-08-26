import assert from "node:assert/strict";
import test from "node:test";

import { AES, CTR } from "../src/crypto/index.ts";
import { sha1, testBuffer } from "./helpers/test-utils.ts";

test("AES-CTR small", () => {
	const key = testBuffer(24);
	const data = testBuffer(32);
	const aes = new AES(key.subarray(0, 16));

	const ctrEncrypt = new CTR(aes, key.subarray(16), 0);
	ctrEncrypt.encrypt(data);

	assert.strictEqual(
		data.toString("hex"),
		"8de7dac3d95eca9fd74f30c1ecf8247a8f25d1b3fd2d11a8a7b458d16a085434",
	);

	const ctrDecrypt = new CTR(aes, key.subarray(16), 0);
	ctrDecrypt.decrypt(data);

	assert.deepStrictEqual(data, testBuffer(32), "decrypted buffer differs");
});

test("AES-CTR large", () => {
	const size = 151511;
	const key = testBuffer(24);
	const data = testBuffer(size);
	const aes = new AES(key.subarray(0, 16));

	const ctrEncrypt = new CTR(aes, key.subarray(16), 0);
	ctrEncrypt.encrypt(data);

	const sha1Data = sha1(data);
	assert.strictEqual(sha1Data, "2ec4f058ba6100f7e28b4ff7bb9a711a5de57c64");

	const ctrDecrypt = new CTR(aes, key.subarray(16), 0);
	ctrDecrypt.decrypt(data);

	assert.deepStrictEqual(data, testBuffer(size), "decrypted buffer differs");
});
