import { Badge } from "@/components/badge";
import type { CircleStatus } from "@/types/circle";
import { cn } from "@/utils";
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
			className={cn("cursor-default ml-1", {
				"bg-yellow-500": status === "incomplete",
			})}
		>
			{getCircleStatusLabel(status)}
		</Badge>
	);
}
