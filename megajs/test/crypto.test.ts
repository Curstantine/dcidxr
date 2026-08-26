import assert from "node:assert/strict";
import test from "node:test";

import { AES } from "../src/crypto/index.ts";
import { sha1, testBuffer } from "./helpers/test-utils.ts";

test("AES-CBC", () => {
	const aes = new AES(testBuffer(16));
	const d0 = testBuffer(160);
	const d0e = Buffer.from(d0);

	aes.encryptCBC(d0e);
	assert.strictEqual(sha1(d0e), "cd9a7168ec42cb0cc1f2a18575ff7794b4b5a95d");

	const d0d = Buffer.from(d0e);
	aes.decryptCBC(d0d);

	assert.strictEqual(sha1(d0), sha1(d0d));
});

test("AES wrong key size", () => {
	let aes: AES | undefined;

	assert.throws(
		() => {
			aes = new AES(testBuffer(8));
		},
		{
			message: "Wrong key length. Key must be 128bit.",
		},
	);
	assert.throws(
		() => {
			aes = new AES(testBuffer(32));
		},
		{
			message: "Wrong key length. Key must be 128bit.",
		},
	);

	assert.strictEqual(aes, undefined);
});
