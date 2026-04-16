import { Badge } from "@/components/badge";
import type { CircleStatus } from "@/types/circle";
import { getCircleStatusLabel } from "@/utils/grammar";

type Props = {
	status: CircleStatus;
	statusText: string;
};

export function StatusIndicator({ status, statusText }: Props) {
	return (
		<Badge
			title={statusText}
			variant={status === "complete" ? "default" : "destructive"}
			className="cursor-default ml-1"
		>
			{getCircleStatusLabel(status)}
		</Badge>
	);
}
