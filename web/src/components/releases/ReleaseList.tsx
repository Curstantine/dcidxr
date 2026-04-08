import { For } from "solid-js";

import ReleaseCard from "~/components/releases/ReleaseCard";
import type { ReleaseList as Releases } from "~/components/releases/types";

type ReleaseListProps = {
	items: Releases;
};

export default function ReleaseList(props: ReleaseListProps) {
	return (
		<ul class="space-y-3">
			<For each={props.items}>{(release) => <ReleaseCard release={release} />}</For>
		</ul>
	);
}
