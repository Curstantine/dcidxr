type ReleasePageHeaderProps = {
	email?: string;
};

export default function ReleasePageHeader(props: ReleasePageHeaderProps) {
	return (
		<div class="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
			<div>
				<h1 class="text-3xl! font-semibold! text-slate-900! normal-case!">Release Index</h1>
				<p class="text-sm text-slate-600">
					Signed in as <b class="font-medium text-slate-800">{props.email}</b>
				</p>
			</div>
		</div>
	);
}
