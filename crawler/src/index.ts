import { fetchReleases } from "./fetch.ts";
import { transform } from "./transform.ts";

async function main(): Promise<void> {
	const args = process.argv.slice(2);
	const normalizedArgs = args[1] === "--" ? [args[0], ...args.slice(2)] : args;
	const [command, inputArg, outputArg] = normalizedArgs;

	switch (command) {
		case "transform":
			await transform(inputArg, outputArg);
			break;
		case "fetch":
			await fetchReleases(inputArg, outputArg);
			break;
		case "help":
		case "--help":
		case "-h":
			printUsage();
			break;
		default:
			printUsage();
			process.exitCode = 1;
			return;
	}
}

function printUsage(): void {
	console.error("Usage:");
	console.error("  node src/index.ts transform [inputPath] [outputPath]");
	console.error("  node src/index.ts fetch [inputPath] [outputPath]");
	console.error("");
	console.error("Defaults:");
	console.error("  transform: input=dist/input.json output=dist/transformed.json");
	console.error("  fetch:     input=dist/transformed.json output=dist/releases.json");
}

try {
	await main();
} catch (error: unknown) {
	const message = error instanceof Error ? error.message : String(error);
	console.error(`Error: ${message}`);
	process.exitCode = 1;
}
