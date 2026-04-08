import { For } from "solid-js";

type ReleaseLinkGroupProps = {
	title: string;
	links: string[];
};

export default function ReleaseLinkGroup(props: ReleaseLinkGroupProps) {
	return (
		<div class="mt-2 space-y-1">
			<p class="text-xs font-semibold tracking-wide text-slate-500 uppercase">{props.title}</p>
			<ul class="space-y-1">
				<For each={props.links}>
					{(link) => (
						<li>
							<a
								href={link}
								target="_blank"
								rel="noreferrer"
								class="text-sky-700 hover:text-sky-600 hover:underline"
							>
								{link}
							</a>
						</li>
					)}
				</For>
			</ul>
		</div>
	);
}
