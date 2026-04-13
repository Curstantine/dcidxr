import { useDebouncer } from "@tanstack/react-pacer";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { LucideCopy, LucideSearch } from "lucide-react";
import { type ChangeEvent, type SubmitEvent, Suspense, useState } from "react";
import { toast } from "sonner";

import { getSession } from "@/auth/func";
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
import { StatusIndicator } from "@/components/status-indicator";
import { circlesQueryOptions, type FetchCirclesShape, fetchCirclesInput } from "@/queries/circle";
import type { SearchType } from "@/types/circle";
import { SEARCH_TYPE_ITEMS } from "@/utils/grammar";

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

	const [typeValue, setTypeValue] = useState<SearchType>(searchType);

	const handleSearchChange = useDebouncer(
		(e: ChangeEvent<HTMLInputElement>) => {
			e.preventDefault();
			router.preloadRoute({
				to: "/",
				search: { search: e.target.value, searchType: typeValue },
			});
		},
		{ wait: 300, key: "HandleSearchChange" },
	);

	const handleSubmit = (e: SubmitEvent<HTMLFormElement>) => {
		e.preventDefault();
		const formData = new FormData(e.currentTarget);
		const value = formData.get("search") as string;

		handleSearchChange.flush();

		router.navigate({
			to: "/",
			search: { search: value, searchType: typeValue },
		});
	};

	return (
		<form
			onSubmit={handleSubmit}
			className="grid grid-cols-[7rem_1fr] sm:grid-cols-[7rem_1fr_5rem] gap-x-2 items-center sticky top-10 h-18 sm:h-10 bg-background"
		>
			<Select<SearchType>
				name="searchType"
				items={SEARCH_TYPE_ITEMS}
				value={typeValue}
				onValueChange={(value) => setTypeValue(value ?? "circle")}
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
	const { search, cursor, searchType } = Route.useSearch({
		select: ({ search, cursor, searchType }) => ({ search, cursor, searchType }),
	});
	const {
		data: { circles, total },
	} = useSuspenseQuery(circlesQueryOptions({ search, cursor, searchType }));

	return (
		<section className="flex flex-col gap-2 mt-2">
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
