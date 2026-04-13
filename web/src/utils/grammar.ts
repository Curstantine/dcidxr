import type { CircleStatus, QueryType } from "@/types/circle";

export const SEARCH_TYPE_ITEMS: readonly { value: QueryType; label: string }[] = [
	{ value: "releases", label: "Releases" },
	{ value: "circles", label: "Circles" },
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
