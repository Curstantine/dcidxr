import assert from "node:assert/strict";
import test from "node:test";

import { prepareKey } from "../src/crypto/index.ts";
import { testBuffer } from "./helpers/test-utils.ts";

test("prepareKey - 8 bytes", () => {
	const derivedKey = prepareKey(testBuffer(8));
	const keyAsString = derivedKey.toString("hex");

	assert.strictEqual(keyAsString, "c4589a459956887caf0b408635c3c03b");
});

test("prepareKey - 10 bytes", () => {
	const derivedKey = prepareKey(testBuffer(10));
	const keyAsString = derivedKey.toString("hex");

	assert.strictEqual(keyAsString, "59930b1c55d783ac77df4c4ff261b0f1");
});

test("prepareKey - 64 bytes", () => {
	const derivedKey = prepareKey(testBuffer(64));
	const keyAsString = derivedKey.toString("hex");

	assert.strictEqual(keyAsString, "83bd84689f057f9ed9834b3ecb81d80e");
});
