import { transform } from "./transform";

function main(): void {
	const [command, inputArg, outputArg] = process.argv.slice(2);

	switch (command) {
		case "transform":
			transform(inputArg, outputArg);
			break;
		default:
			printUsage();
			process.exitCode = 1;
			return;
	}
}

function printUsage(): void {
	console.error("Usage: node src/index.ts transform [inputPath] [outputPath]");
}

try {
	main();
} catch (error: unknown) {
	const message = error instanceof Error ? error.message : String(error);
	console.error(`Error: ${message}`);
	process.exitCode = 1;
}
