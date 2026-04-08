import { Show } from "solid-js";

import type { Release } from "~/components/releases/types";
import ReleaseLinkGroup from "~/components/releases/ReleaseLinkGroup";
import ReleaseStatusBadge from "~/components/releases/ReleaseStatusBadge";

type ReleaseCardProps = {
	release: Release;
};

export default function ReleaseCard(props: ReleaseCardProps) {
	const release = () => props.release;

	return (
		<li class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
			<div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
				<div class="space-y-1">
					<h2 class="text-lg font-semibold text-slate-900">{release().name}</h2>
					<p class="text-sm text-slate-600">
						Circle: <span class="font-medium text-slate-800">{release().circle.name}</span>
					</p>
					<div class="flex items-center gap-2 text-sm">
						<span class="text-slate-600">Status:</span>
						<ReleaseStatusBadge status={release().circle.status} />
					</div>
					<Show when={release().circle.statusText.trim().length > 0}>
						<p class="text-sm text-slate-600">{release().circle.statusText}</p>
					</Show>
				</div>
				<p class="text-sm font-semibold text-slate-700">{release().sizeMb} MB</p>
			</div>
			<div class="mt-4 grid gap-1 text-sm">
				<a
					href={release().megaLink}
					target="_blank"
					rel="noreferrer"
					class="text-sky-700 hover:text-sky-600 hover:underline"
				>
					Release Mega Link
				</a>
				<Show when={release().circle.megaLinks.length > 0}>
					<ReleaseLinkGroup title="Circle Mega Links" links={release().circle.megaLinks} />
				</Show>
				<Show when={release().circle.missingLinks.length > 0}>
					<ReleaseLinkGroup title="Missing Discord Links" links={release().circle.missingLinks} />
				</Show>
			</div>
		</li>
	);
}
