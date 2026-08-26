import crypto from "node:crypto";
import type { Readable } from "node:stream";

export function stream2cb(
	stream: Readable,
	cb: (error: Error | null, result?: Buffer) => void,
): void {
	const chunks: Buffer[] = [];
	let complete = false;
	stream.on("data", (d: Buffer) => {
		chunks.push(d);
	});
	stream.on("end", () => {
		if (!complete) {
			complete = true;
			cb(null, Buffer.concat(chunks));
		}
	});
	stream.on("error", (e: Error) => {
		if (!complete) {
			complete = true;
			cb(e);
		}
	});
}

export function stream2promise(stream: Readable): Promise<Buffer> {
	const chunks: Buffer[] = [];
	let complete = false;

	return new Promise((resolve, reject) => {
		stream.on("data", (d: Buffer) => {
			chunks.push(d);
		});
		stream.on("end", () => {
			if (!complete) {
				complete = true;
				resolve(Buffer.concat(chunks));
			}
		});
		stream.on("error", (e: Error) => {
			if (!complete) {
				complete = true;
				reject(e);
			}
		});
	});
}

// Generate buffer with specific size.
export function testBuffer(size: number, start = 0, step = 1): Buffer {
	const buffer = Buffer.alloc(size);
	for (let i = 0; i < size; i++) {
		buffer[i] = (start + i * step) % 255;
	}
	return buffer;
}

// Helper for getting hex-sha1 for a buffer.
export function sha1(buf: Buffer): string {
	const shasum = crypto.createHash("sha1");
	shasum.update(buf);
	return shasum.digest("hex");
}
