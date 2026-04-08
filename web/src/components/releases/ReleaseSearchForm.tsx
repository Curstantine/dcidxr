import { Show } from "solid-js";

type ReleaseSearchFormProps = {
	query: string;
	showClear: boolean;
};

export default function ReleaseSearchForm(props: ReleaseSearchFormProps) {
	return (
		<form
			method="get"
			class="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row"
		>
			<input
				type="search"
				name="q"
				value={props.query}
				placeholder="Search release, circle, status, links, size, or mega link"
				class="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 placeholder:text-slate-500 focus:border-sky-600 focus:outline-none"
			/>
			<div class="flex gap-2">
				<button
					type="submit"
					class="rounded-lg bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-600"
				>
					Search
				</button>
				<Show when={props.showClear}>
					<a
						href="/"
						class="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
					>
						Clear
					</a>
				</Show>
			</div>
		</form>
	);
}
