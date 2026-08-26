import { Transform, type Readable, type Writable } from "node:stream";
import type { Callback } from "./types.ts";

export function streamToCb(
	stream: Readable,
	cb: (error: Error | null, result?: Buffer) => void,
): void {
	const chunks: Buffer[] = [];
	let complete = false;

	stream.on("data", (d: Buffer) => chunks.push(d));
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

export function chunkSizeSafe(size: number): Transform {
	let last: Buffer | undefined;

	return new Transform({
		transform(chunk: Buffer, _encoding, callback) {
			let current = chunk;
			if (last) {
				current = Buffer.concat([last, current]);
			}

			const end = Math.floor(current.length / size) * size;
			if (!end) {
				last = current;
			} else if (current.length > end) {
				last = current.subarray(end);
				this.push(current.subarray(0, end));
			} else {
				last = undefined;
				this.push(current);
			}
			callback();
		},
		flush(callback) {
			if (last) {
				this.push(last);
			}
			callback();
		},
	});
}

export function detectSize(targetStream: Writable, cb: (size: number) => void): Transform {
	const chunks: Buffer[] = [];
	let size = 0;

	return new Transform({
		transform(chunk: Buffer, _encoding, callback) {
			chunks.push(chunk);
			size += chunk.length;
			callback();
		},
		flush(callback) {
			cb(size);

			function handleChunk() {
				while (chunks.length) {
					const next = chunks.shift()!;
					const needDrain = !targetStream.write(next);
					if (needDrain) {
						targetStream.once("drain", handleChunk);
						return;
					}
				}
				targetStream.end();
				callback();
			}
			handleChunk();
		},
	});
}

export function createSkipStream(skipBytes: number): Transform {
	let remaining = skipBytes;

	return new Transform({
		transform(chunk: Buffer, _encoding, callback) {
			if (remaining <= 0) {
				this.push(chunk);
				return callback();
			}

			if (chunk.length <= remaining) {
				remaining -= chunk.length;
				return callback();
			}

			const sliced = chunk.subarray(remaining);
			remaining = 0;
			this.push(sliced);
			callback();
		},
	});
}

// Based on https://github.com/morenyang/create-promise-callback/
export function createPromise<T = any>(
	originalCb?: Callback<T>,
): [(error: Error | null, result?: T) => void, Promise<T>] {
	let cb!: (error: Error | null, result?: T) => void;
	const promise = new Promise<T>((resolve, reject) => {
		cb = (err: Error | null, arg?: T) => {
			if (err) {
				reject(err);
			} else {
				resolve(arg as T);
			}
		};
	});

	if (originalCb) {
		promise.then(
			(arg) => originalCb(null, arg),
			(err) => originalCb(err),
		);
	}

	return [cb, promise];
}
