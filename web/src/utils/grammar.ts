import type { CircleStatus, SearchType } from "@/types/circle";

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
