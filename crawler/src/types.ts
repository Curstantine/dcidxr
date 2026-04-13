export type Message = {
	content?: unknown;
};

export type InputPayload = {
	messages?: unknown;
};

export type Group = {
	circle: string;
	links: string[];
	missingLink: string | null;
	status: string | null;
	statusMeta: string | null;
	lastUpdated: string | null;
};

export type TransformedPayload = {
	groups: Group[];
};
