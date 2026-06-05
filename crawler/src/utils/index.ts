export function normalizeString(value: string | null | undefined): string | null {
	if (typeof value !== "string") return null;

	const normalized = value.trim();
	return normalized.length > 0 ? normalized : null;
}

export function normalizeNodeName(name: string | null | undefined, fallback = "Unknown"): string {
	const normalized = typeof name === "string" ? name.trim() : "";
	return normalized.length > 0 ? normalized : fallback;
}

export async function mapWithConcurrency<TInput, TOutput>(
	values: TInput[],
	concurrency: number,
	mapper: (value: TInput, index: number) => Promise<TOutput>,
): Promise<TOutput[]> {
	if (values.length === 0) return [];

	const results: TOutput[] = Array.from(
		{ length: values.length },
		() => null as unknown as TOutput,
	);
	let nextIndex = 0;

	const worker = async (): Promise<void> => {
		while (nextIndex < values.length) {
			const currentIndex = nextIndex;
			nextIndex += 1;
			results[currentIndex] = await mapper(values[currentIndex], currentIndex);
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
