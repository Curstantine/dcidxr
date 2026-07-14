import { wait } from "@jabascript/core";

export function normalizeNodeName(name: string | null | undefined, fallback = "Unknown"): string {
	const normalized = typeof name === "string" ? name.trim() : "";
	return normalized.length > 0 ? normalized : fallback;
}

export async function mapWithConcurrency<TInput, TOutput>(
	values: TInput[],
	concurrency: number,
	retryCount: number,
	mapper: (value: TInput, index: number) => Promise<TOutput>,
): Promise<TOutput[]> {
	if (values.length === 0) return [];

	const results: TOutput[] = Array.from(
		{ length: values.length },
		() => null as unknown as TOutput,
	);
	let nextIndex = 0;
	let hasFailed = false;

	const worker = async (): Promise<void> => {
		while (nextIndex < values.length && !hasFailed) {
			const currentIndex = nextIndex;
			nextIndex += 1;

			let attempts = 0;
			while (true) {
				try {
					results[currentIndex] = await mapper(values[currentIndex], currentIndex);
					break;
				} catch (error) {
					const message = error instanceof Error ? error.message : String(error);

					if (attempts < retryCount && !hasFailed) {
						attempts += 1;
						console.warn(
							`[mapWithConcurrency] Mapper failed at index ${currentIndex}. Retrying (attempt ${attempts}/${retryCount})...\n` +
								`Error: ${message}`,
						);

						await wait(1000);
					} else {
						hasFailed = true;
						const contextError = new Error(
							`[mapWithConcurrency] Failed at index ${currentIndex}.\n` +
								`Item context:\n${JSON.stringify(values[currentIndex], undefined, 2)}\n` +
								`Original Error: ${message}`,
						);

						if (error instanceof Error && error.stack) {
							contextError.stack = error.stack;
						}

						throw contextError;
					}
				}
			}
		}
	};

	const workerCount = Math.max(1, Math.min(concurrency, values.length));
	await Promise.all(Array.from({ length: workerCount }, () => worker()));

	return results;
}

export function dedupeByKey<T>(values: T[], getKey: (value: T) => string): T[] {
	const seen = new Set<string>();
	const deduped: T[] = [];

	for (const value of values) {
		const key = getKey(value);
		if (seen.has(key)) continue;

		seen.add(key);
		deduped.push(value);
	}

	return deduped;
}

export function* chunkIter<T>(values: T[], size: number): Generator<T[]> {
	if (size <= 0) throw new Error("Chunk size must be greater than 0");

	for (let i = 0; i < values.length; i += size) {
		yield values.slice(i, i + size);
	}
}

export function bToMB(sizeBytes: number): number {
	if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) return 0;
	return Math.max(1, Math.ceil(sizeBytes / (1024 * 1024)));
}
