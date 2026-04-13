import type { CircleStatus, SearchType } from "@/types/circle";
import type { ServerMetaKey } from "@/types/meta";

export const SEARCH_TYPE_ITEMS: readonly { value: SearchType; label: string }[] = [
	{ value: "circle", label: "Circles" },
	{ value: "release", label: "Releases" },
];

export function getCircleStatusLabel(status: CircleStatus): string {
	switch (status) {
		case "complete":
			return "Complete";
		case "incomplete":
			return "Incomplete";
		case "missing":
			return "Missing";
		default:
			return "";
	}
}

export function getServerMetaLabel(key: ServerMetaKey): string {
	switch (key) {
		case "last_indexed":
			return "Last Indexed";
		case "last_crawled":
			return "Last Crawled";
		default:
			return "";
	}
}
