import { Title } from "@solidjs/meta";
import { useOAuthLogin } from "start-oauth";
import { Discord } from "~/components/Icons";

export default function Login() {
	const login = useOAuthLogin();

	return (
		<main>
			<Title>Sign In</Title>
			<h1>Sign in</h1>
			<div class="space-y-6 font-medium">
				<a
					href={login("discord")}
					rel="external"
					class="group flex w-full items-center justify-center gap-2.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-gray-700 transition-colors duration-300 hover:border-gray-300 hover:bg-[#5865F2] hover:text-white focus:outline-none"
				>
					<Discord class="h-5 fill-[#5865F2] duration-300 group-hover:fill-white" />
					Sign in with Discord
				</a>
			</div>
		</main>
	);
}
