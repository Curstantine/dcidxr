import assert from "node:assert/strict";
import test from "node:test";

import { AES, prepareKey } from "../src/crypto/index.ts";
import { testBuffer } from "./helpers/test-utils.ts";

const derivedKey = prepareKey(testBuffer(8));
const aes = new AES(derivedKey);

test("stringhash - 10 byte email", () => {
	const emailBuffer = testBuffer(10);
	const hash = aes.stringhash(emailBuffer);
	const hashAsString = hash.toString("hex");

	assert.strictEqual(hashAsString, "9e791646c66840b5");
});

test("stringhash - 16 byte email", () => {
	const emailBuffer = testBuffer(16);
	const hash = aes.stringhash(emailBuffer);
	const hashAsString = hash.toString("hex");

	assert.strictEqual(hashAsString, "6ba07aca224e84a4");
});

test("stringhash - 32 byte email", () => {
	const emailBuffer = testBuffer(32);
	const hash = aes.stringhash(emailBuffer);
	const hashAsString = hash.toString("hex");

	assert.strictEqual(hashAsString, "6a1e6c5539c0ed48");
});
