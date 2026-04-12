import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";

import { getSession } from "@/auth/func";
import { Badge } from "@/components/badge";
import { Input } from "@/components/input";
import { circlesQueryOptions, type FetchCirclesShape } from "@/queries/circle";
import type { CircleStatus } from "@/types/circle";
import { Button } from "@/components/button";

export const Route = createFileRoute("/")({
	loader: async ({ context }) => {
		await context.queryClient.ensureQueryData(circlesQueryOptions({ search: "", cursor: 0 }));
	},
	beforeLoad: async () => {
		const session = await getSession();
		if (!session) throw redirect({ to: "/auth/login" });

		return { user: session.user };
	},
	component: RouteComponent,
});

function RouteComponent() {
	const [search, setSearch] = useState("");
	const [cursor, setCursor] = useState(0);
	const circlesQuery = useSuspenseQuery(circlesQueryOptions({ search, cursor }));

	return (
		<main className="max-w-4xl mx-auto">
			<nav className="text-center py-2 text-sm">
				Doujin Cafe - <code className="bg-accent p-0.5 rounded">#collection</code> Index
			</nav>

			<section className="mb-8 mt-1">
				<form>
					<Input type="text" placeholder="Search releases..." />
				</form>
			</section>

			<ul>
				{circlesQuery.data.circles.map((circle) => (
					<CircleLine
						key={circle.id}
						id={circle.id}
						name={circle.name}
						status={circle.status}
						statusText={circle.statusText}
						megaLinks={circle.megaLinks}
						missingLink={circle.missingLink}
						lastUpdated={circle.lastUpdated}
						releases={circle.releases}
					/>
				))}
			</ul>
		</main>
	);
}

function CircleLine({
	id,
	name,
	status,
	statusText,
	releases,
}: FetchCirclesShape["circles"][number]) {
	return (
		<li key={id} className="flex flex-col p-2 border not-last:border-b-0">
			<div className="flex gap-1 items-center">
				<h2>{name}</h2>
                <div className="flex-1" />
                <Button type="button">
                    <span className="iconify bxl--" />
                </Button>
				<StatusIndicator status={status} statusText={statusText} />
			</div>
			<ul className="text-sm text-muted-foreground">
				{releases.map((release) => (
					<li key={release.id}>{release.name}</li>
				))}
			</ul>
		</li>
	);
}

function StatusIndicator({ status, statusText }: { status: CircleStatus; statusText: string }) {
	return (
		<Badge
			title={statusText}
			variant={status === "complete" ? "default" : "destructive"}
			className="cursor-default"
		>
			{status}
		</Badge>
	);
}
