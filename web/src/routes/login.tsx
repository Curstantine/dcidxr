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
					class="group w-full px-3 py-2 bg-white border border-gray-200 rounded-lg hover:bg-[#5865F2] hover:border-gray-300 focus:outline-none transition-colors duration-300 flex items-center justify-center gap-2.5 text-gray-700 hover:text-white"
				>
					<Discord class="h-5 fill-[#5865F2] group-hover:fill-white duration-300" />
					Sign in with Discord
				</a>
			</div>
		</main>
	);
}
