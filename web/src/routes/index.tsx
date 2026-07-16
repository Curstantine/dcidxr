import { useAsyncDebouncer } from "@tanstack/react-pacer";
import { useSuspenseInfiniteQuery, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import {
	LucideCopy,
	LucideGitBranch,
	LucideLogOut,
	LucideMusic2,
	LucideSearch,
} from "lucide-react";
import { type ChangeEvent, useEffect, useRef, type SubmitEvent, Suspense, useState } from "react";
import { toast } from "sonner";

import { authClient } from "@/auth/client";
import { getSession } from "@/auth/func";

import { Button } from "@/components/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/input-group";
import { Kbd } from "@/components/kbd";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/select";
import { StatusIndicator } from "@/components/status-indicator";
import { Toggle } from "@/components/toggle";

import {
	circlesInfiniteQueryOptions,
	type FetchCirclesShape,
	fetchCirclesInput,
} from "@/queries/circle";
import { serverMetaQueryOptions } from "@/queries/meta";

import { getServerMetaLabel, SEARCH_TYPE_ITEMS } from "@/utils/grammar";

import type { SearchType } from "@/types/circle";

import { env } from "@/env";

export const Route = createFileRoute("/")({
	validateSearch: fetchCirclesInput,
	loaderDeps: ({ search }) => ({
		search: search.search,
		searchType: search.searchType,
		includeTracks: search.includeTracks,
	}),
	loader: async ({ context, deps }) => {
		context.queryClient.ensureQueryData(serverMetaQueryOptions);
		return context.queryClient.ensureInfiniteQueryData(
			circlesInfiniteQueryOptions({
				search: deps.search,
				searchType: deps.searchType,
				includeTracks: deps.includeTracks,
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
	const router = useRouter();

	return (
		<main className="mx-auto max-w-4xl px-2">
			<nav className="sticky top-0 flex h-10 items-center justify-between bg-background py-2 text-sm">
				<div className="flex-1" />
				<span>
					Doujin Cafe - <code className="rounded bg-accent p-0.5">#collection</code> index
				</span>
				<div className="flex flex-1 justify-end">
					<Button
						type="button"
						size="sm"
						variant="ghost"
						aria-label="Logout"
						onClick={async () => {
							await authClient.signOut();
							router.navigate({ to: "/auth/login" });
						}}
					>
						<LucideLogOut className="size-3.5" />
					</Button>
				</div>
			</nav>

			<Form />

			<Suspense fallback={<span>Loading...</span>}>
				<Results />
			</Suspense>

			<footer className="mt-8 flex justify-end border-t border-border py-4 text-sm">
				<FooterInfo />

				<div className="flex-1" />
				<a
					href={env.VITE_SOURCE_URL}
					target="_blank"
					rel="noopener noreferrer"
					aria-label="Source"
				>
					<LucideGitBranch className="size-4" />
				</a>
			</footer>
		</main>
	);
}

function FooterInfo() {
	const { data } = useSuspenseQuery(serverMetaQueryOptions);

	return (
		<section className="flex flex-col">
			<h2 className="text-foreground">Metadata</h2>
			{data.map(({ key, value }) => (
				<span key={key} className="text-xs text-muted-foreground">
					{getServerMetaLabel(key)}: {value}
				</span>
			))}
		</section>
	);
}

function Form() {
	const router = useRouter();
	const { search, searchType, includeTracks } = Route.useSearch({
		select: ({ search, searchType, includeTracks }) => ({
			search,
			searchType,
			includeTracks,
		}),
	});

	const inputRef = useRef<HTMLInputElement>(null);
	const [typeValue, setTypeValue] = useState<SearchType>(searchType);
	const [includeTracksValue, setIncludeTracksValue] = useState(includeTracks);

	useEffect(() => {
		setTypeValue(searchType);
		setIncludeTracksValue(includeTracks);
	}, [searchType, includeTracks]);

	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			if (e.key === "k" && (e.ctrlKey || e.metaKey)) {
				e.preventDefault();
				inputRef.current?.focus();
			}
		};

		document.addEventListener("keydown", handler);
		return () => document.removeEventListener("keydown", handler);
	}, []);

	const queueSearchPreload = useAsyncDebouncer(
		(search: string) =>
			router.preloadRoute({
				to: "/",
				search: {
					search,
					searchType: typeValue,
					includeTracks: includeTracksValue,
				},
			}),
		{ wait: 350, key: "HandleSearchChange" },
	);

	const handleValueChange = async (
		searchValue: string | undefined,
		currentType: SearchType,
		currentIncludeTracks: boolean,
	) => {
		await queueSearchPreload.flush();
		router.navigate({
			to: "/",
			search: {
				search: searchValue || undefined,
				searchType: currentType,
				includeTracks: currentIncludeTracks,
				cursor: undefined,
			},
		});
	};

	const handleSubmit = async (e: SubmitEvent<HTMLFormElement>) => {
		e.preventDefault();
		await handleValueChange(inputRef.current?.value, typeValue, includeTracksValue);
	};

	return (
		<form
			onSubmit={handleSubmit}
			className="sticky top-10 grid h-18 grid-cols-[1fr_8rem] items-center gap-x-2 bg-background sm:h-10 sm:grid-cols-[7rem_1fr_8rem]"
		>
			<Select<SearchType>
				name="searchType"
				items={SEARCH_TYPE_ITEMS}
				value={typeValue}
				onValueChange={(v) => {
					const value = v ?? "all";
					const search = inputRef.current?.value;
					setTypeValue(value);
					handleValueChange(search, value, includeTracksValue);
				}}
			>
				<SelectTrigger className="w-full">
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

			<InputGroup className="order-3 col-span-full sm:order-2 sm:col-span-1">
				<InputGroupInput
					ref={inputRef}
					type="search"
					name="search"
					placeholder="Search..."
					defaultValue={search}
					onChange={(e: ChangeEvent<HTMLInputElement>) => {
						const search = e.target.value;
						queueSearchPreload.maybeExecute(search);
					}}
					className="appearance-none"
				/>
				<InputGroupAddon align="inline-start">
					<LucideSearch />
				</InputGroupAddon>
				<InputGroupAddon align="inline-end" className="hidden sm:flex">
					<Kbd>ctrl</Kbd>
					<Kbd>k</Kbd>
				</InputGroupAddon>
			</InputGroup>

			<Toggle
				variant="outline"
				title="Include tracks"
				pressed={includeTracksValue}
				className="order-2 sm:order-3"
				onPressedChange={(p) => {
					const search = inputRef.current?.value;
					setIncludeTracksValue(p);
					handleValueChange(search, typeValue, p);
				}}
			>
				<LucideMusic2 />
				{includeTracksValue ? "Include tracks" : "Exclude tracks"}
			</Toggle>

			{/* Visually hidden submit button strictly for accessibility/Enter behavior */}
			<button type="submit" className="sr-only" aria-hidden="true" tabIndex={-1} />
		</form>
	);
}

function Results() {
	const { search, searchType, includeTracks } = Route.useSearch({
		select: ({ search, searchType, includeTracks }) => ({
			search,
			searchType,
			includeTracks,
		}),
	});
	const { data, hasNextPage, fetchNextPage, isFetchingNextPage } = useSuspenseInfiniteQuery(
		circlesInfiniteQueryOptions({ search, searchType, includeTracks }),
	);

	const circles = data.pages.flatMap((p) => p.circles);

	return (
		<section className="mt-2 flex flex-col gap-2">
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
						releases={circle.releases}
					/>
				))}
			</ul>

			<section className="mt-2 flex justify-center">
				{hasNextPage ? (
					<Button
						type="button"
						variant="outline"
						size="lg"
						onClick={() => fetchNextPage()}
						disabled={isFetchingNextPage}
					>
						{isFetchingNextPage ? "Loading..." : "Show more"}
					</Button>
				) : (
					<span className="text-sm text-muted-foreground">No more results</span>
				)}
			</section>
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
		toast.success("Copied all links to clipboard");
	};

	return (
		<li className="flex flex-col border p-2 not-last:border-b-0 first:rounded-t-md last:rounded-b-md">
			<div className="flex flex-wrap items-center gap-1 pb-2">
				<h2 className="font-medium">{name}</h2>
				<StatusIndicator status={status} statusText={statusText} />

				<div className="flex-1" />
				{missingLink && (
					<Button
						type="button"
						size="sm"
						variant="link"
						nativeButton={false}
						render={<a href={missingLink} target="_blank" rel="noopener noreferrer" />}
					>
						Missing
					</Button>
				)}
				<Button type="button" size="sm" variant="outline" onClick={copyAllLinks}>
					<LucideCopy className="size-3" />
					Copy Links
				</Button>
			</div>
			<ul className="space-y-3 text-xs text-muted-foreground sm:space-y-0 sm:text-sm">
				{releases.map((release) => (
					<ReleaseLine key={release.id} release={release} />
				))}
			</ul>
		</li>
	);
}

function ReleaseLine({
	release,
}: {
	release: FetchCirclesShape["circles"][number]["releases"][number];
}) {
	const tracks = (release as { tracks?: { id: number; name: string }[] }).tracks;

	return (
		<li className="flex flex-col gap-y-1 py-1">
			<a href={release.megaLink} target="_blank" rel="noopener noreferrer">
				{release.name}
			</a>
			{tracks && tracks.length > 0 && (
				<ul className="space-y-0.5 pl-4">
					{tracks.map((track) => (
						<li key={track.id} className="text-muted-foreground">
							{track.name}
						</li>
					))}
				</ul>
			)}
		</li>
	);
}
