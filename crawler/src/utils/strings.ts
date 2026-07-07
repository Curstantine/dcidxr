import type { DbCircleStatus, FetchGroup } from "./types.ts";

export function normalizeString(value: string | null | undefined): string | null {
	if (typeof value !== "string") return null;

	const normalized = value.trim();
	return normalized.length > 0 ? normalized : null;
}

export function normalizeStatus(status: string | null | undefined): DbCircleStatus {
	switch (status) {
		case "missing":
			return "missing";
		case "complete":
		case "completed":
			return "complete";
		case "incomplete":
			return "incomplete";
		default:
			return "incomplete";
	}
}

export function buildStatusText(group: FetchGroup, mappedStatus: DbCircleStatus): string {
	const sourceStatus = normalizeString(group.status);
	const statusMeta = normalizeString(group.statusMeta);

	const parts = [sourceStatus, statusMeta ? `[${statusMeta}]` : null].filter(
		(value): value is string => value !== null,
	);

	if (parts.length > 0) return parts.join(" - ");

	switch (mappedStatus) {
		case "complete":
			return "Completed";
		case "missing":
			return "Missing releases";
		default:
			return "Incomplete";
	}
}
