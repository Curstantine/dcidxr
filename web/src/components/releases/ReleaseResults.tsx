import { Show } from "solid-js";

import ReleaseList from "~/components/releases/ReleaseList";
import type { ReleaseList as ReleaseItems } from "~/components/releases/types";

type ReleaseResultsProps = {
	items: ReleaseItems | undefined;
	search: string;
};

export default function ReleaseResults(props: ReleaseResultsProps) {
	return (
		<Show
			when={props.items}
			fallback={
				<p class="rounded-xl border border-slate-200 bg-white p-6 text-slate-600">
					Loading releases...
				</p>
			}
		>
			{(items) => (
				<Show
					when={items().length > 0}
					fallback={
						<p class="rounded-xl border border-slate-200 bg-white p-6 text-slate-600">
							{props.search.length > 0
								? "No releases matched your search."
								: "No releases found yet. Add records to the database to see them here."}
						</p>
					}
				>
					<ReleaseList items={items()} />
				</Show>
			)}
		</Show>
	);
}
