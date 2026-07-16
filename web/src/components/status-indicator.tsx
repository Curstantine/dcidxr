import { Badge } from "@/components/badge";

import { getCircleStatusLabel } from "@/utils/grammar";

import type { CircleStatus } from "@/types/circle";

type Props = {
	status: CircleStatus;
	statusText: string;
};

export function StatusIndicator({ status, statusText }: Props) {
	return (
		<Badge
			title={statusText}
			variant={status === "complete" ? "default" : "destructive"}
			className="ml-1 cursor-default"
		>
			{getCircleStatusLabel(status)}
		</Badge>
	);
}
