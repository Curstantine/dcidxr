import fs from "node:fs/promises";
import esbuild from "esbuild";

async function doBuild() {
	await fs.mkdir("dist", { recursive: true });

	// ESM bundle
	await esbuild.build({
		entryPoints: ["src/index.ts"],
		bundle: true,
		platform: "node",
		target: "node24",
		format: "esm",
		outfile: "dist/index.js",
		packages: "external",
		sourcemap: true,
	});

	// CJS bundle
	await esbuild.build({
		entryPoints: ["src/index.ts"],
		bundle: true,
		platform: "node",
		target: "node24",
		format: "cjs",
		outfile: "dist/index.cjs",
		packages: "external",
		sourcemap: true,
	});

	console.log("Build completed with success");
}

doBuild().catch((error) => {
	console.error(error.stack || error);
	process.exit(1);
});
