import { promises as fs } from "node:fs";
import path from "node:path";

export function resolveInputPath(
	inputArg: string | undefined,
	defaultRelativePath: string,
): string {
	return path.resolve(process.cwd(), inputArg ?? defaultRelativePath);
}

export function resolveOutputPath(
	outputArg: string | undefined,
	defaultRelativePath: string,
): string {
	return path.resolve(process.cwd(), outputArg ?? defaultRelativePath);
}

export function parseJson<T>(raw: string, filePath: string): T {
	try {
		return JSON.parse(raw) as T;
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		throw new Error(`Invalid JSON in ${filePath}: ${message}`);
	}
}

export async function readJsonFile<T>(filePath: string): Promise<T> {
	const raw = await fs.readFile(filePath, "utf8");
	return parseJson<T>(raw, filePath);
}

export async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
	await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}
