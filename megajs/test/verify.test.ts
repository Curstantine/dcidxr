import assert from "node:assert/strict";
import test from "node:test";

import { verify } from "../src/index.ts";
import { stream2promise, testBuffer } from "./helpers/test-utils.ts";

test("MEGA verify stream", async () => {
	const size = 151511;
	const d0 = testBuffer(size);
	const d0e = Buffer.from(d0);
	const key = Buffer.from("AAAAAAAAAABnFCfbJFwAxwAAAAAAAAAAZxQn2yRcAMc", "base64");
	const verifyStream = verify(key);

	verifyStream.write(d0e.subarray(0, 50000));
	verifyStream.write(d0e.subarray(50000, 100000));
	verifyStream.end(d0e.subarray(100000, size));

	await stream2promise(verifyStream);
	assert.strictEqual(verifyStream.mac.toString("hex"), "671427db245c00c7");
});

test("Should not accept wrong key sizes", () => {
	assert.throws(() => verify(Buffer.alloc(10)), {
		message: "Wrong key length. Key must be 256bit.",
	});
});
