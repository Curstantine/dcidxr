import API from "./api.ts";
import {
	AES,
	CTR,
	MAC,
	d64,
	e64,
	formatKey,
	getCipher,
	megaDecrypt,
	megaEncrypt,
	megaVerify,
	prepareKey,
	prepareKeyV2,
} from "./crypto/index.ts";
import File from "./file.ts";
import MutableFile from "./mutable-file.ts";
import Storage from "./storage.ts";
import type { Callback, StorageOptions } from "./types.ts";

function mega(options: StorageOptions, cb?: Callback<Storage>): Storage {
	return new Storage(options, cb);
}

mega.Storage = Storage;
mega.File = File;
mega.MutableFile = MutableFile;
mega.API = API;
mega.file = File.fromURL;
mega.encrypt = megaEncrypt;
mega.decrypt = megaDecrypt;
mega.verify = megaVerify;

const fileFromURL = File.fromURL;

export {
	Storage,
	File,
	MutableFile,
	API,
	AES,
	CTR,
	MAC,
	prepareKey,
	prepareKeyV2,
	formatKey,
	e64,
	d64,
	getCipher,
	fileFromURL as file,
	megaEncrypt as encrypt,
	megaDecrypt as decrypt,
	megaVerify as verify,
};

export type * from "./types.ts";
export default mega;
