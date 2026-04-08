type ReleaseStatusBadgeProps = {
	status: "incomplete" | "complete";
};

export default function ReleaseStatusBadge(props: ReleaseStatusBadgeProps) {
	return (
		<span
			class={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
				props.status === "complete"
					? "bg-emerald-100 text-emerald-700"
					: "bg-amber-100 text-amber-700"
			}`}
		>
			{props.status}
		</span>
	);
}
