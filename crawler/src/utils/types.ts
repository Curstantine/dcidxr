export type Message = {
	content?: unknown;
};

export type TransformInputPayload = {
	messages?: unknown;
};

export type GroupBase = {
	circle: string;
	links: string[];
	missingLink: string | null;
	status: string | null;
	statusMeta: string | null;
	lastUpdated: string | null;
};

export type TransformOutputPayload = {
	groups: GroupBase[];
};

export type ReleaseFile = {
	name: string;
	sizeBytes: number;
};

export type Release = {
	name: string;
	link: string;
	directory: boolean;
	sizeBytes: number;
	files: ReleaseFile[];
};

export type FetchGroup = GroupBase & {
	releases: Release[];
	errors: string[];
};

export type FetchInputPayload = TransformOutputPayload;

export type FetchOutputPayload = {
	groups: FetchGroup[];
};

export type SyncInputPayload = FetchOutputPayload;

export type DbCircleStatus = "missing" | "incomplete" | "complete";
