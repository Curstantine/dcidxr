import { useMatch } from "@solidjs/router";
import { Show } from "solid-js";
import { useAuth } from "~/components/Context";

export default function Nav() {
	const { signedIn, logout } = useAuth();
	const isHome = useMatch(() => "/");
	const isAbout = useMatch(() => "/about");

	return (
		<nav class="fixed top-0 left-0 z-50 flex w-full items-center justify-between bg-sky-800 px-4 py-3 text-sm font-medium shadow-sm">
			<a
				href="/"
				class={`border-b-2 px-3 py-2 text-sky-100 uppercase transition-colors duration-200 ${
					isHome() ? "border-sky-300 text-white" : "border-transparent hover:text-white"
				}`}
			>
				Home
			</a>
			<a
				href="/about"
				class={`border-b-2 px-3 py-2 text-sky-100 uppercase transition-colors duration-200 ${
					isAbout() ? "border-sky-300 text-white" : "border-transparent hover:text-white"
				}`}
			>
				About
			</a>
			<Show
				when={signedIn()}
				fallback={
					<a
						href="/login"
						class="ml-auto rounded-md border border-sky-600 bg-sky-700 px-4 py-2 text-sky-100 transition-colors duration-200 hover:bg-sky-600 hover:text-white focus:outline-none"
					>
						Login
					</a>
				}
			>
				<form action={logout} method="post" class="ml-auto">
					<button
						type="submit"
						class="rounded-md border border-sky-600 bg-sky-700 px-4 py-2 text-sky-100 transition-colors duration-200 hover:bg-sky-600 hover:text-white focus:outline-none"
					>
						Sign Out
					</button>
				</form>
			</Show>
		</nav>
	);
}
