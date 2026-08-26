import type { IncomingMessage, Server, ServerResponse } from "node:http";
import type { URL } from "node:url";

export interface MockFile {
	h: string;
	t: number;
	a: string;
	k: string;
	p?: string;
	ts: number;
	u: string;
	s?: number;
}

export interface MockUserData {
	files: MockFile[];
	shares: any[];
}

export interface MockShareData {
	handler: string;
	uh: string;
	keys?: Record<string, string>;
	[key: string]: any;
}

export interface MockState {
	idCounter?: number;
	users: Map<string, MockUserData>;
	shares: Map<string, MockShareData>;
	uploadStates: Map<string, number[][]>;
	loginData: Map<string, any>;
	[key: string]: any;
}

export interface MockServerOptions {
	dataFolder: string;
	state?: MockState;
	generateId?: () => string;
	simulateDownloadError?: (url: URL, req: IncomingMessage, res: ServerResponse) => Error | void;
	simulateUploadError?: (url: URL, req: IncomingMessage, res: ServerResponse) => Error | void;
}

export type MockServer = Server & {
	state: MockState;
};
