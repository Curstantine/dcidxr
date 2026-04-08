import { useSearchParams } from "@solidjs/router";
import { createEffect, onCleanup, Show } from "solid-js";
import { X } from "./Icons";

export default function ErrorNotification() {
	const [searchParams, setSearchParams] = useSearchParams();

	createEffect(() => {
		if (searchParams.error) {
			const timer = setTimeout(() => setSearchParams({ error: "" }), 5000);
			onCleanup(() => clearTimeout(timer));
		}
	});

	return (
		<Show when={typeof searchParams.error === "string" && searchParams.error} keyed>
			{(msg) => (
				<aside class="fixed bottom-4 left-4 z-50 flex max-w-sm items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm shadow-lg transition-all duration-300">
					<div>
						<strong class="font-medium text-red-800">Error</strong>
						<p class="mt-1 text-red-700 select-text">{msg}</p>
					</div>
					<button
						onclick={() => setSearchParams({ error: "" })}
						class="text-red-400 transition-colors hover:text-red-600"
					>
						<X class="h-4 w-4" />
					</button>
				</aside>
			)}
		</Show>
	);
}
