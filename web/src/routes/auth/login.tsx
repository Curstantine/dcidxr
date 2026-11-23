import { Form } from "@base-ui/react/form";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { LucideEye, LucideEyeOff } from "lucide-react";
import { useState } from "react";
import * as z from "zod/mini";

import { authClient } from "@/auth/client";
import { getSession } from "@/auth/func";

import { Button } from "@/components/button";
import { Field, FieldError, FieldLabel, FieldSeparator } from "@/components/field";
import { Input } from "@/components/input";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupButton,
	InputGroupInput,
} from "@/components/input-group";

export const Route = createFileRoute("/auth/login")({
	validateSearch: z.object({
		hasAccess: z.optional(z.boolean()),
		error: z.optional(z.string()),
	}),
	beforeLoad: async () => {
		const session = await getSession();
		if (session) throw redirect({ to: "/" });
		return null;
	},
	component: RouteComponent,
});

const loginSchema = z.object({
	email: z.email("Enter a valid email address"),
	password: z.string().check(z.minLength(1, "Password is required")),
});

type FieldErrors = Partial<Record<keyof z.infer<typeof loginSchema>, string[] | undefined>>;

function RouteComponent() {
	const { hasAccess, error } = Route.useSearch();
	const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
	const [isLoading, setIsLoading] = useState(false);
	const [showPassword, setShowPassword] = useState(false);

	const handleDiscordLogin = async () => {
		await authClient.signIn.social({
			provider: "discord",
			callbackURL: "/",
		});
	};

	const handleEmailLogin = async (formValues: Form.Values) => {
		const parsed = loginSchema.safeParse(formValues);
		if (!parsed.success) {
			setFieldErrors(z.flattenError(parsed.error).fieldErrors);
			return;
		}

		setIsLoading(true);
		setFieldErrors({});

		try {
			const result = await authClient.signIn.email({
				email: parsed.data.email,
				password: parsed.data.password,
				callbackURL: "/",
			});

			if (result.error) {
				setFieldErrors({
					password: [result.error.message ?? "Invalid email or password."],
				});
			}
		} catch (err) {
			setFieldErrors({
				password: [err instanceof Error ? err.message : "An unexpected error occurred."],
			});
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<main className="mx-auto flex min-h-dvh flex-col items-center justify-center px-4 pb-12 sm:max-w-sm sm:px-0">
			{hasAccess !== undefined && !hasAccess && (
				<div className="border border-current p-2 text-center text-red-500 dark:text-red-400">
					<p>You do not have access to the certain server and channel!!</p>
				</div>
			)}
			<h1 className="mb-6 text-2xl font-medium">Login</h1>

			<Form
				errors={fieldErrors}
				onFormSubmit={handleEmailLogin}
				className="mb-6 flex w-full flex-col gap-3"
			>
				<Field name="email">
					<FieldLabel htmlFor="email">Email</FieldLabel>
					<Input
						id="email"
						name="email"
						type="email"
						placeholder="you@example.com"
						autoComplete="username"
						spellCheck={false}
						enterKeyHint="next"
						required
					/>
					<FieldError />
				</Field>

				<Field name="password">
					<FieldLabel htmlFor="password">Password</FieldLabel>
					<InputGroup>
						<InputGroupInput
							id="password"
							name="password"
							type={showPassword ? "text" : "password"}
							placeholder="Password"
							autoComplete="current-password"
							enterKeyHint="done"
							required
						/>
						<InputGroupAddon align="inline-end">
							<InputGroupButton
								type="button"
								size="icon-xs"
								aria-pressed={showPassword}
								aria-label={showPassword ? "Hide password" : "Show password"}
								onClick={() => setShowPassword((prev) => !prev)}
							>
								{showPassword ? <LucideEyeOff /> : <LucideEye />}
							</InputGroupButton>
						</InputGroupAddon>
					</InputGroup>
					<FieldError />
				</Field>

				{error && <p className="text-sm text-red-500 dark:text-red-400">{error}</p>}

				<Button type="submit" size="lg" disabled={isLoading}>
					{isLoading ? "Signing in..." : "Sign in with Email"}
				</Button>
			</Form>

			<FieldSeparator className="mt-1 mb-6 w-full">or</FieldSeparator>

			<Button
				type="button"
				size="lg"
				variant="discord"
				onClick={handleDiscordLogin}
				className="w-full"
			>
				<span aria-hidden className="iconify size-6 bxl--discord-alt" />
				Sign in with Discord
			</Button>
		</main>
	);
}
