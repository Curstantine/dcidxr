import API from "./api.mjs";
import { megaDecrypt, megaEncrypt, megaVerify } from "./crypto/index.mjs";
import File from "./file.mjs";
import MutableFile from "./mutable-file.mjs";
import Storage from "./storage.mjs";

// ES module bundles entry
const fileFromURL = File.fromURL;

export {
	API,
	File,
	fileFromURL as file,
	MutableFile,
	megaDecrypt as decrypt,
	megaEncrypt as encrypt,
	megaVerify as verify,
	Storage,
};
