import assert from "node:assert/strict";
import { Readable } from "node:stream";
import test, { describe } from "node:test";

import { AES, e64, getCipher } from "../src/crypto/index.ts";
import { File, Storage } from "../src/index.ts";
import { sha1, testBuffer } from "./helpers/test-utils.ts";

const gatewayUrl = process.env.MEGA_MOCK_URL;
if (!gatewayUrl) throw new Error("Missing MEGA_MOCK_URL environment variable");

describe("Storage", { concurrency: 1 }, () => {
	let storage: Storage;

	test("Should allow creating a Storage object", async () => {
		storage = new Storage({
			email: "mock@test",
			password: "mock",
			autologin: false,
			gateway: gatewayUrl,
		});
		assert.strictEqual(storage.status, "closed");

		await storage.ready;
	});

	test("Should require an email when logging to MEGA", () => {
		return new Promise<void>((resolve, reject) => {
			new Storage(
				{
					gateway: gatewayUrl,
				},
				(error) => {
					if (error) {
						assert.strictEqual(
							error.message,
							"starting a session without credentials isn't supported",
						);
						return resolve();
					}
					reject(new Error("Unexpected success"));
				},
			);
		});
	});

	test("Should require an email when logging to MEGA using promises", () => {
		return new Storage({
			gateway: gatewayUrl,
		}).ready.then(
			() => {
				throw new Error("Unexpected success");
			},
			(error) => {
				assert.strictEqual(
					error.message,
					"starting a session without credentials isn't supported",
				);
			},
		);
	});

	test("Should require an email when logging to MEGA using .login()", () => {
		return new Promise<void>((resolve, reject) => {
			const unauthedStorage = new Storage({
				autologin: false,
				gateway: gatewayUrl,
			});

			return unauthedStorage.login((error) => {
				if (error) {
					assert.strictEqual(
						error.message,
						"starting a session without credentials isn't supported",
					);
					return resolve();
				}
				reject(new Error("Unexpected success"));
			});
		});
	});

	test("Should require an email when logging to MEGA using .login() and promises", () => {
		const unauthedStorage = new Storage({
			autologin: false,
			gateway: gatewayUrl,
		});

		return unauthedStorage.login().then(
			() => {
				throw new Error("Unexpected success");
			},
			(error) => {
				assert.strictEqual(
					error.message,
					"starting a session without credentials isn't supported",
				);
			},
		);
	});

	test("Should require valid credentials when logging to MEGA", () => {
		const badStorage = new Storage({
			email: "invalid@credentials",
			password: "invalid",
			autologin: false,
			gateway: gatewayUrl,
		});

		return badStorage.login().then(
			() => {
				throw new Error("Unexpected success");
			},
			(error) => {
				assert.strictEqual(
					error.message,
					"ENOENT (-9): Object (typically, node or user) not found. Wrong password?",
				);
			},
		);
	});

	test("Should login to MEGA", () => {
		return new Promise<void>((resolve, reject) => {
			storage.login((error, result) => {
				if (error) return reject(error);

				assert.strictEqual(result, storage);
				assert.strictEqual(storage.name, "Test User");
				assert.strictEqual(storage.user, "jCf2Pc0pLCU");

				resolve();
			});
		});
	});

	test("Should upload buffers", () => {
		return new Promise<void>((resolve, reject) => {
			storage.upload(
				{
					name: "test file buffer",
					key: Buffer.alloc(24),
				},
				Buffer.alloc(16),
				(error, file) => {
					if (error) return reject(error);

					assert.strictEqual(file.name, "test file buffer");
					resolve();
				},
			);
		});
	});

	test("Should not allow uploading without a size", () => {
		assert.throws(
			() => {
				storage.upload({ name: "skipped file" });
			},
			{
				message: "Specify a file size or set allowUploadBuffering to true",
			},
		);
	});

	test("Should stream upload", async () => {
		const dataSize = 2 * 1024 * 1024;
		const uploadedData = testBuffer(dataSize);
		const uploadStream = storage.upload({
			name: "test file streams",
			key: Buffer.alloc(24),
			size: dataSize,
		});
		uploadStream.end(Buffer.from(uploadedData));

		const file = await uploadStream.complete;
		assert.strictEqual(file.name, "test file streams");
		assert.strictEqual(
			file.key!.toString("hex"),
			"0000000000000000831f1ab870f945580000000000000000831f1ab870f94558",
		);
		assert.strictEqual(file.size, dataSize);
	});

	test("Should stream download", async () => {
		const file = storage.root!.children!.find((e) => e.name === "test file streams")!;
		const uploadedData = testBuffer(file.size!);
		const uploadedHash = sha1(uploadedData);
		const singleConnData = await file.downloadBuffer({
			maxConnections: 1,
		});
		assert.strictEqual(singleConnData.length, file.size);
		assert.strictEqual(sha1(singleConnData), uploadedHash);

		const multiConnData = await file.downloadBuffer();
		assert.strictEqual(multiConnData.length, file.size);
		assert.strictEqual(sha1(singleConnData), uploadedHash);
	});

	test("Should share files", () => {
		return new Promise<void>((resolve, reject) => {
			const file = storage.root!.children!.find((e) => e.name === "test file buffer")!;

			file.link((error, link) => {
				if (error) return reject(error);
				assert.strictEqual(
					link,
					"https://mega.nz/file/AAAAAAAE#AAAAAAAAAACldyOdMzqeRgAAAAAAAAAApXcjnTM6nkY",
				);
				resolve();
			});
		});
	});

	test("Should load metadata with non-last key slot", () => {
		const masterKey = Buffer.from("00112233445566778899aabbccddeeff", "hex");
		const goodNodeKey = Buffer.from("102132435465768798a9bacbdcedfe0f", "hex");
		const badNodeKey = Buffer.from("f0e1d2c3b4a5968778695a4b3c2d1e0f", "hex");

		const encryptWithMasterKey = (key: Buffer) => {
			const encryptedKey = Buffer.from(key);
			new AES(masterKey).encryptECB(encryptedKey);
			return encryptedKey;
		};

		const packedAttributes = Buffer.alloc(32);
		Buffer.from('MEGA{"n":"folder root"}').copy(packedAttributes);
		getCipher(goodNodeKey).encryptCBC(packedAttributes);

		const file = new File({
			downloadId: "AAAAAAAB",
			key: e64(masterKey),
			directory: true,
		});

		file.loadMetadata(new AES(masterKey), {
			t: 1,
			a: e64(packedAttributes),
			k: `node:${e64(encryptWithMasterKey(goodNodeKey))}/share:${e64(encryptWithMasterKey(badNodeKey))}`,
		});

		assert.strictEqual(file.name, "folder root");
		assert.deepStrictEqual(file.attributes, { n: "folder root" });
		assert.strictEqual(file.key!.toString("hex"), goodNodeKey.toString("hex"));
	});

	test("Should download shared files (old format)", () => {
		return new Promise<void>((resolve, reject) => {
			const file = File.fromURL(
				"https://mega.nz/#!AAAAAAAE!AAAAAAAAAACldyOdMzqeRgAAAAAAAAAApXcjnTM6nkY",
			);
			file.api = storage.api;

			file.loadAttributes((error, loadedFile) => {
				if (error) return reject(error);
				assert.strictEqual(file, loadedFile);

				assert.strictEqual(file.size, 16);
				assert.strictEqual(file.directory, false);
				assert.strictEqual(file.name, "test file buffer");
				assert.deepStrictEqual(file.attributes, { n: "test file buffer" });

				file.download((downloadErr, data) => {
					if (downloadErr) return reject(downloadErr);
					assert.strictEqual(data!.toString("hex"), Buffer.alloc(16).toString("hex"));
					resolve();
				});
			});
		});
	});

	test("Should download shared files (new format)", () => {
		return new Promise<void>((resolve, reject) => {
			const file = File.fromURL(
				"https://mega.nz/file/AAAAAAAE#AAAAAAAAAACldyOdMzqeRgAAAAAAAAAApXcjnTM6nkY",
			);
			file.api = storage.api;

			file.loadAttributes((error, loadedFile) => {
				if (error) throw error;
				assert.strictEqual(file, loadedFile);

				assert.strictEqual(file.size, 16);
				assert.strictEqual(file.directory, false);
				assert.strictEqual(file.name, "test file buffer");
				assert.deepStrictEqual(file.attributes, { n: "test file buffer" });

				file.download((downloadErr, data) => {
					if (downloadErr) return reject(downloadErr);
					assert.strictEqual(data!.toString("hex"), Buffer.alloc(16).toString("hex"));
					resolve();
				});
			});
		});
	});

	test("Should download shared files using promises", async () => {
		const file = File.fromURL(
			"https://mega.nz/#!AAAAAAAE!AAAAAAAAAACldyOdMzqeRgAAAAAAAAAApXcjnTM6nkY",
		);
		file.api = storage.api;

		const loadedFile = await file.loadAttributes();
		assert.strictEqual(file, loadedFile);

		assert.strictEqual(file.size, 16);
		assert.strictEqual(file.directory, false);
		assert.strictEqual(file.name, "test file buffer");
		assert.deepStrictEqual(file.attributes, { n: "test file buffer" });

		const data = await file.downloadBuffer();
		assert.strictEqual(data.toString("hex"), Buffer.alloc(16).toString("hex"));
	});

	test("Should create folders", () => {
		return new Promise<void>((resolve, reject) => {
			storage.mkdir(
				{
					name: "test folder",
					key: Buffer.alloc(16),
				},
				(error, folder) => {
					if (error) return reject(error);

					assert.strictEqual(folder.name, "test folder");
					resolve();
				},
			);
		});
	});

	test("Should share folders", () => {
		return new Promise<void>((resolve, reject) => {
			const folder = storage.root!.children!.find((e) => e.name === "test folder")!;

			folder.link(
				{
					key: Buffer.alloc(16),
				},
				(error, link) => {
					if (error) return reject(error);
					assert.strictEqual(
						link,
						"https://mega.nz/folder/AAAAAAAG#AAAAAAAAAAAAAAAAAAAAAA",
					);
					resolve();
				},
			);
		});
	});

	test("Should create folders in shared folders", () => {
		return new Promise<void>((resolve, reject) => {
			const parent = storage.root!.children!.find((e) => e.name === "test folder")!;

			parent.mkdir(
				{
					name: "test folder 2",
					key: Buffer.alloc(16),
				},
				(error, folder) => {
					if (error) return reject(error);

					assert.strictEqual(folder.name, "test folder 2");
					assert.strictEqual(folder.parent, parent);
					resolve();
				},
			);
		});
	});

	test("Should upload files in folders in shared folders", () => {
		return new Promise<void>((resolve, reject) => {
			const folder = storage
				.root!.children!.find((e) => e.name === "test folder")!
				.children!.find((e) => e.name === "test folder 2")!;

			folder.upload(
				{
					name: "file in folder 2",
					key: Buffer.alloc(24),
				},
				Buffer.alloc(16),
				(error, file) => {
					if (error) return reject(error);

					assert.strictEqual(file.name, "file in folder 2");
					assert.strictEqual(file.parent, folder);
					resolve();
				},
			);
		});
	});

	test("Should upload empty files", () => {
		return new Promise<void>((resolve, reject) => {
			storage.upload(
				{
					name: "empty file",
					key: Buffer.alloc(24),
				},
				Buffer.alloc(0),
				(error, file) => {
					if (error) return reject(error);

					assert.strictEqual(file.name, "empty file");
					resolve();
				},
			);
		});
	});

	test("Should download empty files", () => {
		return new Promise<void>((resolve, reject) => {
			const file = storage.root!.children!.find((e) => e.name === "empty file")!;

			file.download((error, data) => {
				if (error) return reject(error);
				assert.strictEqual(data!.length, 0);
				resolve();
			});
		});
	});

	test("Should create folders using promises", async () => {
		const folder = await storage.mkdir({
			name: "test folder promise",
			key: Buffer.alloc(16),
		});

		assert.strictEqual(folder.name, "test folder promise");
	});

	test("Should upload files using promises", async () => {
		const file = await storage.upload(
			{
				name: "test file buffer promise",
				key: Buffer.alloc(24),
			},
			Buffer.alloc(16),
		).complete;

		assert.strictEqual(file.name, "test file buffer promise");
	});

	test("Should login using promises", async () => {
		const promiseResolvedValue = await storage.ready;
		assert.strictEqual(promiseResolvedValue, storage);
	});

	test("Should share folders using promises", async () => {
		const folder = storage.root!.children!.find((e) => e.name === "test folder")!;

		const link = await folder.link({
			key: Buffer.alloc(16),
		});
		assert.strictEqual(link, "https://mega.nz/folder/AAAAAAAG#AAAAAAAAAAAAAAAAAAAAAA");
	});

	test("Should share folders without passing argument", async () => {
		const folder = storage.root!.children!.find((e) => e.name === "test folder")!;

		const link = await folder.link();
		assert.strictEqual(link, "https://mega.nz/folder/AAAAAAAG#AAAAAAAAAAAAAAAAAAAAAA");
	});

	test("Should share folders without keys", async () => {
		const folder = storage.root!.children!.find((e) => e.name === "test folder")!;

		const link = await folder.link({
			key: Buffer.alloc(16),
			noKey: true,
		});
		assert.strictEqual(link, "https://mega.nz/folder/AAAAAAAG");
	});

	test("Should not release zalgo when using callbacks", () => {
		let released = false;
		new Storage(
			{
				email: "mock@test",
				password: "mock",
				autologin: false,
			},
			() => {
				released = true;
			},
		);
		assert.strictEqual(released, false);
	});

	test("Should not release zalgo when using promises", () => {
		let released = false;
		new Storage({
			email: "mock@test",
			password: "mock",
			autologin: false,
		}).ready.then(() => {
			released = true;
		});
		assert.strictEqual(released, false);
	});

	test("Should share folders using shareFolder (callback)", () => {
		return new Promise<void>((resolve, reject) => {
			const folder = storage.root!.children!.find((e) => e.name === "test folder")!;

			folder.shareFolder(
				{
					key: Buffer.alloc(16),
					noKey: true,
				},
				(error, link) => {
					if (error) return reject(error);
					assert.strictEqual(link, "https://mega.nz/folder/AAAAAAAG");
					resolve();
				},
			);
		});
	});

	test("Should share folders using shareFolder (promise)", async () => {
		const folder = storage.root!.children!.find((e) => e.name === "test folder")!;

		const link = await folder.shareFolder({
			key: Buffer.alloc(16),
			noKey: true,
		});
		assert.strictEqual(link, "https://mega.nz/folder/AAAAAAAG");
	});

	test("Should not release zalgo when using shareFolder", () => {
		return new Promise<void>((resolve, reject) => {
			const folder = storage.root!.children!.find((e) => e.name === "test folder promise")!;

			let zalgoReleased = true;
			folder.shareFolder(
				{
					key: Buffer.alloc(32),
				},
				(error) => {
					if (!error) return reject(new Error("Should fail"));
					assert.strictEqual(error.message, "share key must be 16 byte / 22 characters");
					assert.strictEqual(zalgoReleased, false);
					resolve();
				},
			);
			zalgoReleased = false;
		});
	});

	let uploadedSha: string;
	test("Should upload huge files in parts", async () => {
		const parts = 16;
		const partSize = 128 * 1024;
		const fullSize = parts * partSize;
		const uploadedData = Buffer.alloc(fullSize);
		const uploadStream = storage.upload({
			name: "test file streams 2",
			key: Buffer.alloc(24),
			size: fullSize,
		});

		for (let i = 0; i < parts; i++) {
			const data = testBuffer(partSize);
			data.copy(uploadedData, partSize * i);
			uploadStream.write(data);
			await new Promise((resolve) => setTimeout(resolve, 0));
		}
		uploadStream.end();

		const file = await uploadStream.complete;
		assert.strictEqual(file.name, "test file streams 2");
		assert.strictEqual(file.size, fullSize);
		uploadedSha = sha1(uploadedData);
	});

	test("Should download files uploaded in parts", async () => {
		const file = storage.root!.children!.find((e) => e.name === "test file streams 2")!;
		const downloadedData = await file.downloadBuffer();
		assert.strictEqual(downloadedData.length, file.size);
		assert.strictEqual(sha1(downloadedData), uploadedSha);
	});

	test("Should allowUploadBuffering ", async () => {
		const dataSize = 2 * 1024 * 1024;
		const uploadedData = testBuffer(dataSize);
		const uploadStream = storage.upload({
			name: "test file streams",
			key: Buffer.alloc(24),
			allowUploadBuffering: true,
		});
		uploadStream.end(Buffer.from(uploadedData));

		const file = await uploadStream.complete;
		assert.strictEqual(file.name, "test file streams");
		assert.strictEqual(
			file.key!.toString("hex"),
			"0000000000000000831f1ab870f945580000000000000000831f1ab870f94558",
		);
		assert.strictEqual(file.size, dataSize);
	});

	test("Should stream as upload arguments", async () => {
		const dataSize = 2 * 1024 * 1024;
		const uploadedData = testBuffer(dataSize);
		let readBytes = 0;
		const inputStream = new Readable({
			read(size) {
				const newPointer = readBytes + size;
				this.push(
					readBytes < dataSize ? uploadedData.subarray(readBytes, newPointer) : null,
				);
				readBytes = newPointer;
			},
		});
		const uploadStream = storage.upload(
			{
				name: "test file streams 2",
				key: Buffer.alloc(24),
				size: dataSize,
			},
			inputStream,
		);

		const file = await uploadStream.complete;
		assert.strictEqual(file.name, "test file streams 2");
		assert.strictEqual(
			file.key!.toString("hex"),
			"0000000000000000831f1ab870f945580000000000000000831f1ab870f94558",
		);
		assert.strictEqual(file.size, dataSize);
	});

	test("Should find files using functions", () => {
		const matchingFile = storage.find((e) => (e.name ?? "").includes("test file streams"))!;
		assert.strictEqual(matchingFile.size, 2097152);
	});

	test("Should find files using string", () => {
		const matchingFile = storage.find("file in folder 2", true)!;
		assert.strictEqual(matchingFile.size, 16);
	});

	test("Should find files using arrays", () => {
		const matchingFile = storage.find(["file in folder 2"], true)!;
		assert.strictEqual(matchingFile.size, 16);
	});

	test("Should filter files using functions", () => {
		const matchingFiles = storage.filter((e) => (e.name ?? "").includes("test file streams"));
		assert.strictEqual(matchingFiles.length, 4);
	});

	test("Should filter files using string", () => {
		const matchingFiles = storage.filter("file in folder 2", true);
		assert.strictEqual(matchingFiles.length, 1);
	});

	test("Should filter files using arrays", () => {
		const matchingFiles = storage.filter(
			["test file streams", "test file streams 2", "file in folder 2"],
			true,
		);
		assert.strictEqual(matchingFiles.length, 5);
	});

	test("Should navigate to files using arrays", () => {
		const matchingFile = storage.navigate([
			"test folder",
			"test folder 2",
			"file in folder 2",
		])!;
		assert.strictEqual(matchingFile.size, 16);
	});

	test("Should navigate to files using strings", () => {
		const matchingFile = storage.navigate("test folder/test folder 2/file in folder 2")!;
		assert.strictEqual(matchingFile.size, 16);
	});

	test("All directories should have children", () => {
		for (const node of Object.values(storage.files)) {
			assert.strictEqual(Boolean(node.directory), Boolean(node.children));
		}
	});

	test("Should logout from MEGA", () => {
		return new Promise<void>((resolve, reject) => {
			storage.close((error) => {
				if (error) return reject(error);

				assert.strictEqual(storage.status, "closed");
				resolve();
			});
		});
	});
});
