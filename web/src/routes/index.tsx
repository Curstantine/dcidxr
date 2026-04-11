import { createFileRoute, redirect } from "@tanstack/react-router";

import { getSession } from "@/auth/func";

export const Route = createFileRoute("/")({
	beforeLoad: async () => {
		const session = await getSession();
		if (!session) throw redirect({ to: "/auth/login" });

		return { user: session.user };
	},
	component: RouteComponent,
});

function RouteComponent() {
	const data = Route.useRouteContext();
	return (
		<main className="max-w-4xl mx-auto">
			<nav className="text-center py-2 text-sm">
				Doujin Cafe <code className="bg-accent p-0.5 rounded">#collection</code> index
			</nav>
		</main>
	);
}
