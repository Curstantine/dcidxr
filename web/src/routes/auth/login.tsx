import { createFileRoute, redirect } from "@tanstack/react-router";

import { authClient } from "@/auth/client";
import { getSession } from "@/auth/func";

export const Route = createFileRoute("/auth/login")({
	beforeLoad: async () => {
		const session = await getSession();
		if (session) throw redirect({ to: "/" });

		return null;
	},
	component: RouteComponent,
});

function RouteComponent() {
	const handleDiscordLogin = async () => {
		await authClient.signIn.social({
			provider: "discord",
			callbackURL: "/",
		});
	};

	return (
		<main className="max-w-lg mx-auto flex flex-col items-center justify-center h-screen pb-12 gap-4">
			<h1 className="text-2xl text-white">Login</h1>
			<span className="text-center">
				To use this service, you must sign in with Discord, and must have access to a
				certain server and a channel...
			</span>
			<button
				type="button"
				onClick={handleDiscordLogin}
				className="button w-full justify-center text-white bg-discord hover:bg-discord-hover focus:ring-discord"
			>
				<span className="iconify bxl--discord size-6" />
				Sign in with Discord
			</button>
		</main>
	);
}
