import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { run } from "node:test";
import { spec } from "node:test/reporters";
import { fileURLToPath } from "node:url";

import megamock from "./mock/index.ts";

// Set up temporary directories
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "megajs-tests-"));
console.info("Tests will use this directory:", tempDir);

const serverDir = path.join(tempDir, "server");
await fs.mkdir(serverDir, { recursive: true });

// Set up mock server
const server = megamock({
	dataFolder: serverDir,
});

// Mock data for "mock@test" as username and "mock" as password
server.state.loginData.set("jCf2Pc0pLCU", {
	csid: "CACRPiCIZqylaYVkXvUxvE4XkQeJrwTonOWCikeZFTRPxu5R97xTMTRxNeWlY5keMSLoUACOceI6CHjDLILL-6mQYN37_El9Y5bgmcwJtSHN54au0igwkxxZw_lD7lliQ4uSvSSihQ_iKjj2SxFFmF4F8Sa2UCYQz1iLMDhejR7YAaGGggII5e8jYbtNPOiwwPYf-AFWB7IfOFFXmZ6tLzDJrbodbhAc6EVaiPZZ4QyT6fdKchQeDkjDZu_ygxU0DBQEco1X6SuekGfORsannkJsgAIIlp1Uz-ZdZrrbXoXhFDsCXsibUWJJjF4cPwHMtPSjzcyE_vd-ViFKQJcNDain",
	privk: "AY5AYTQVUt772M3pLi9v7WNhUSYhvrGOnXuyePr4bOlOlckyomWizvB6xqqHGkx3cYXGWTM3QrAxHPFRNhnd47cG974nkGJyjv7NL6vnIGsmtuiMNpLrrkl9nS8itTZCluBWV7jPc6dRlFWNQ7uiT-Bc6d2mFiApd3xYJuNXFmgFo2_8z_1HQhXWOFJIlsESXc_oaxg0QNx8zE9pCdrKWTCw07VKCbAvJNnYGFdSnEjv3phBUkOd2snyK3LA-Kn9ehPgfcDmSfLaCJ_5y5IN18rHGQdRt_Dxs_CabKYgmF6rKMJ8BCfunuOso6Gx984fOvtbyrwxeL6z0QbqsvGe6H3GpoY6d5M0tnFoJz_PlY0EX5gW6Eo0ZGSJ1xcyMewqQt2JBtw-LuMojrwctHc7KchgLgbqqbJHnuRYrOCjkJeySwOHoUR1lP8qjmHUIlSPaRvughULPIoAs6suoRNBgHq_LEvuAFb9zA05El3Z98eKH6Sxstw_K-d7ZbV_k4osKEwCgDa0Y9vTfpcxt6iw0IqGBqkt6v1U8u4lXaiue_0CVbxhrTH4N5Ceyy7yLsyt8ju6hKRljZ5G9fKcB6rvp3h5WxDnLdJ1KTuZatcZI37uAnEBHNhJJoJE-xNIAWIgcfpffQ-BXlBaejTIyAY_zf0SjRnXIYd3PvBVwRFGKNN7Yp-eEiS3nFTvtBuGv8YK1488UJhj4-jLaQdnFRxB3wFoFdaIPdIJowtZkaYlViZ15cNxd70EK97dgUJm9AUJKQGfIopl0ucEtxNUjXn6ekscILk23LpVNE3kDROCxyIOPTGCPKPo-FZtMTQkZxW3vZ6pxjzmCzTm5Q13XmMtMDrEsgVb9jWC9sEMlHxIMLA",
	k: "xMEmMmKm0AbbOf9nGPLgSA",
});

// Start the server
const gateway = await new Promise<string>((resolve, reject) => {
	server.listen(0, "127.0.0.1", () => {
		const addr = server.address();
		if (!addr || typeof addr === "string") {
			return reject(new Error("Failed to get server address"));
		}
		resolve(`http://127.0.0.1:${addr.port}/`);
	});
});

process.env.MEGA_MOCK_URL = gateway;

const testFolder = new URL("..", import.meta.url);
const files = await fs.readdir(fileURLToPath(testFolder));
const testFiles = files
	.filter((e) => e.endsWith(".test.ts"))
	.sort((a, b) => (a.includes("storage") ? 1 : b.includes("storage") ? -1 : a.localeCompare(b)))
	.map((e) => fileURLToPath(new URL(e, testFolder)));

let wasFailed = false;

try {
	const stream = run({
		files: testFiles,
		concurrency: 1,
	});

	stream.compose(spec).pipe(process.stdout);

	await new Promise<void>((resolve, reject) => {
		stream.on("test:fail", () => {
			wasFailed = true;
		});
		stream.on("error", (err) => {
			wasFailed = true;
			reject(err);
		});
		stream.on("end", () => {
			resolve();
		});
	});
} catch (error) {
	console.error("Test execution error:", error);
	wasFailed = true;
}

// Verify if server state is equal to expected server state after tests
if (!wasFailed) {
	const serverStateSerialized = JSON.stringify(server.state);
	const serverStateHash = crypto
		.createHash("blake2b512")
		.update(serverStateSerialized)
		.digest("hex")
		.slice(0, 64);
	const expectedStateHash = "49bd600b894f168a356f9cd2c5b3bf638bafd63c941005097cd893cd35229b99";

	if (serverStateHash !== expectedStateHash) {
		console.error("Got server state hash", serverStateHash);
		console.error("Expected", expectedStateHash);
		wasFailed = true;
	} else {
		console.info("Server state hash verified successfully.");
	}
}

await new Promise<void>((resolve, reject) => {
	server.close((err) => (err ? reject(err) : resolve()));
});
await fs.rm(tempDir, { recursive: true, force: true });

if (wasFailed) {
	process.exit(1);
}
