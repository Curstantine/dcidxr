import { createFileRoute, redirect } from "@tanstack/react-router";
import { type SubmitEvent, useState } from "react";
import z from "zod";

import { authClient } from "@/auth/client";
import { getSession } from "@/auth/func";
import { Button } from "@/components/button";
import { Input } from "@/components/input";

export const Route = createFileRoute("/auth/login")({
	validateSearch: z.object({
		hasAccess: z.boolean().optional(),
		error: z.string().optional(),
	}),
	beforeLoad: async () => {
		const session = await getSession();
		if (session) throw redirect({ to: "/" });
		return null;
	},
	component: RouteComponent,
});

function RouteComponent() {
	const { hasAccess, error } = Route.useSearch();
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [emailError, setEmailError] = useState<string | null>(null);
	const [isLoading, setIsLoading] = useState(false);

	const handleDiscordLogin = async () => {
		await authClient.signIn.social({
			provider: "discord",
			callbackURL: "/",
		});
	};

	const handleEmailLogin = async (e: SubmitEvent) => {
		e.preventDefault();
		setEmailError(null);
		setIsLoading(true);

		try {
			const result = await authClient.signIn.email({
				email,
				password,
				callbackURL: "/",
			});

			if (result.error) {
				setEmailError(
					result.error.message ?? "Invalid email or password.",
				);
			}
		} catch (err) {
			setEmailError(
				err instanceof Error ? err.message : "An unexpected error occurred.",
			);
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<main className="max-w-sm mx-auto flex flex-col items-center justify-center h-screen pb-12">
			{hasAccess !== undefined && !hasAccess && (
				<div className="border p-2 text-center border-current text-red-500 dark:text-red-400">
					<p>You do not have access to the certain server and channel!!</p>
				</div>
			)}
			<h1 className="text-2xl mb-6 font-medium">Login</h1>

			<form onSubmit={handleEmailLogin} className="w-full flex flex-col gap-3 mb-6">
				<Input
					name="email"
					type="email"
					placeholder="Email"
					value={email}
					onChange={(e) => setEmail((e.target as HTMLInputElement).value)}
					required
					autoComplete="email"
				/>
				<Input
					name="password"
					type="password"
					placeholder="Password"
					value={password}
					onChange={(e) => setPassword((e.target as HTMLInputElement).value)}
					required
					autoComplete="current-password"
				/>
				{emailError && (
					<p className="text-sm text-red-500 dark:text-red-400">{emailError}</p>
				)}
				{error && (
					<p className="text-sm text-red-500 dark:text-red-400">{error}</p>
				)}
				<Button type="submit" size="lg" disabled={isLoading}>
					{isLoading ? "Signing in..." : "Sign in with Email"}
				</Button>
			</form>

			<div className="flex items-center gap-3 w-full mb-6">
				<hr className="flex-1 border-border" />
				<span className="text-xs text-muted-foreground">or</span>
				<hr className="flex-1 border-border" />
			</div>

			<Button
				type="button"
				size="lg"
				variant="discord"
				onClick={handleDiscordLogin}
			>
				<span aria-hidden className="iconify bxl--discord-alt size-6" />
				Sign in with Discord
			</Button>
		</main>
	);
}
