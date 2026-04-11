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
	return <main>hi, {data.user.name}</main>;
}
