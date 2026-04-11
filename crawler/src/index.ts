import { fetchReleases } from "./fetch.ts";
import { transform } from "./transform.ts";

async function main(): Promise<void> {
	const [command, inputArg, outputArg] = process.argv.slice(2);

	switch (command) {
		case "transform":
			transform(inputArg, outputArg);
			break;
		case "fetch":
			await fetchReleases(inputArg, outputArg);
			break;
		default:
			printUsage();
			process.exitCode = 1;
			return;
	}
}

function printUsage(): void {
	console.error("Usage: node src/index.ts <transform|fetch> [inputPath] [outputPath]");
}

try {
	await main();
} catch (error: unknown) {
	const message = error instanceof Error ? error.message : String(error);
	console.error(`Error: ${message}`);
	process.exitCode = 1;
}
