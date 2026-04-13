import { useDebouncer } from "@tanstack/react-pacer";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { LucideCopy, LucideSearch } from "lucide-react";
import { type ChangeEvent, type SubmitEvent, Suspense } from "react";
import { toast } from "sonner";

import { getSession } from "@/auth/func";
import { Badge } from "@/components/badge";
import { Button } from "@/components/button";
import { Input } from "@/components/input";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/select";
import { circlesQueryOptions, type FetchCirclesShape, fetchCirclesInput } from "@/queries/circle";
import type { CircleStatus, QueryType } from "@/types/circle";
import { getCircleStatusLabel, SEARCH_TYPE_ITEMS } from "@/utils/grammar";

export const Route = createFileRoute("/")({
	validateSearch: fetchCirclesInput,
	loaderDeps: ({ search }) => ({
		search: search.search,
		cursor: search.cursor,
		searchType: search.searchType,
	}),
	loader: async ({ context, deps }) => {
		return context.queryClient.ensureQueryData(
			circlesQueryOptions({
				search: deps.search,
				cursor: deps.cursor,
				searchType: deps.searchType,
			}),
		);
	},
	beforeLoad: async () => {
		const session = await getSession();
		if (!session) throw redirect({ to: "/auth/login" });

		return { user: session.user };
	},
	component: RouteComponent,
});

function RouteComponent() {
	return (
		<main className="max-w-4xl mx-auto px-2">
			<nav className="text-center py-2 text-sm sticky top-0 bg-background h-10">
				Doujin Cafe - <code className="bg-accent p-0.5 rounded">#collection</code> Index
			</nav>

			<Form />

			<Suspense fallback={<span>Loading...</span>}>
				<Results />
			</Suspense>
		</main>
	);
}

function Form() {
	const router = useRouter();
	const { search, searchType } = Route.useSearch({
		select: ({ search, searchType }) => ({ search, searchType }),
	});

	const handleSearchChange = useDebouncer(
		(value: ChangeEvent<HTMLInputElement>) => {
			router.preloadRoute({
				to: "/",
				search: { search: value.target.value, searchType },
			});
		},
		{ wait: 300, key: "HandleSearchChange" },
	);

	const handleSubmit = (e: SubmitEvent<HTMLFormElement>) => {
		e.preventDefault();
		const formData = new FormData(e.currentTarget);
		const searchValue = formData.get("search") as string;

		router.navigate({
			to: "/",
			search: { search: searchValue, searchType },
		});
	};

	return (
		<form
			onSubmit={handleSubmit}
			className="grid grid-cols-[7rem_1fr] sm:grid-cols-[7rem_1fr_5rem] gap-x-2 items-center sticky top-10 h-18 sm:h-10 bg-background"
		>
			<Select<QueryType>
				name="searchType"
				defaultValue={searchType}
				items={SEARCH_TYPE_ITEMS}
			>
				<SelectTrigger className="w-28">
					<SelectValue placeholder="Query" />
				</SelectTrigger>
				<SelectContent alignItemWithTrigger={false}>
					<SelectGroup>
						{SEARCH_TYPE_ITEMS.map((item) => (
							<SelectItem key={item.value} value={item.value}>
								{item.label}
							</SelectItem>
						))}
					</SelectGroup>
				</SelectContent>
			</Select>
			<Input
				type="search"
				name="search"
				placeholder="Search..."
				defaultValue={search}
				onChange={handleSearchChange.maybeExecute}
			/>
			<Button type="submit" className="col-span-full sm:col-span-1">
				<LucideSearch />
				Search
			</Button>
		</form>
	);
}

function Results() {
	const { search, cursor } = Route.useSearch({
		select: ({ search, cursor }) => ({ search, cursor }),
	});
	const {
		data: { circles, total },
	} = useSuspenseQuery(circlesQueryOptions({ search, cursor }));

	return (
		<section className="flex flex-col gap-4 mt-2">
			<span className="text-sm">
				Matching: {total.circles} circles, {total.releases} releases
			</span>

			<ul>
				{circles.map((circle) => (
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
		</section>
	);
}

function CircleLine({
	id,
	name,
	status,
	statusText,
	releases,
	megaLinks,
	missingLink,
}: FetchCirclesShape["circles"][number]) {
	const copyAllLinks = () => {
		navigator.clipboard.writeText(megaLinks.join("\n"));
		toast("Copied all links to clipboard");
	};

	return (
		<li className="flex flex-col p-2 border not-last:border-b-0 first:rounded-t-md last:rounded-b-md">
			<div className="flex gap-1 items-center pb-2">
				<h2 className="font-medium">{name}</h2>
				<StatusIndicator status={status} statusText={statusText} />

				<div className="flex-1" />
				{missingLink && (
					<Button type="button" size="sm" variant="link">
						Missing
					</Button>
				)}
				<Button type="button" size="sm" variant="outline" onClick={copyAllLinks}>
					<LucideCopy className="size-3" />
					Copy Links
				</Button>
			</div>
			<ul className="text-xs space-y-3 sm:space-y-0 sm:text-sm text-muted-foreground">
				{releases.map((release) => (
					<li key={release.id}>
						<a href={release.megaLink} target="_blank" rel="noopener noreferrer">
							{release.name}
						</a>
					</li>
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
			className="cursor-default ml-1"
		>
			{getCircleStatusLabel(status)}
		</Badge>
	);
}
