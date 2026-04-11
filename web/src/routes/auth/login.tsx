import { createFileRoute, redirect } from "@tanstack/react-router";
import z from "zod";

import { authClient } from "@/auth/client";
import { getSession } from "@/auth/func";
import { Button } from "@/components/button";

export const Route = createFileRoute("/auth/login")({
	validateSearch: z.object({ hasAccess: z.boolean().optional() }),
	beforeLoad: async () => {
		const session = await getSession();
		if (session) throw redirect({ to: "/" });
		return null;
	},
	component: RouteComponent,
});

function RouteComponent() {
	const { hasAccess } = Route.useSearch();

	const handleDiscordLogin = async () => {
		await authClient.signIn.social({
			provider: "discord",
			callbackURL: "/",
		});
	};

	return (
		<main className="max-w-lg mx-auto flex flex-col items-center justify-center h-screen pb-12">
			{hasAccess !== undefined && !hasAccess && (
				<div className="border p-2 text-center border-current text-red-500 dark:text-red-400">
					<p>You do not have access to the certain server and channel!!</p>
				</div>
			)}
			<h1 className="text-2xl font-medium">Login</h1>
			<span className="text-center mb-6 mt-1">
				To use this service, you must sign in with Discord, and must have access to a
				certain server and a channel...
			</span>
			<Button type="button" size="lg" variant="discord" onClick={handleDiscordLogin}>
				<span aria-hidden className="iconify bxl--discord-alt size-6" />
				Sign in with Discord
			</Button>
		</main>
	);
}
