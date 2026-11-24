import { createFileRoute, Link } from "@tanstack/react-router";
import { LucideArrowLeft } from "lucide-react";

import { Button } from "@/components/button";
import { Kbd } from "@/components/kbd";

export const Route = createFileRoute("/help")({
	component: RouteComponent,
});

function RouteComponent() {
	return (
		<main className="mx-auto max-w-4xl px-2 pb-8">
			<nav
				aria-label="Primary"
				className="sticky top-0 z-50 flex h-10 items-center justify-between bg-background py-2 text-sm"
			>
				<div className="flex flex-1 items-center">
					<Button
						size="sm"
						variant="ghost"
						render={<Link to="/" />}
						className="-ml-2 gap-1.5 text-muted-foreground hover:text-foreground"
					>
						<LucideArrowLeft className="size-3.5" aria-hidden="true" />
						<span>Back</span>
					</Button>
				</div>
				<h1 className="text-sm font-normal">Help</h1>
				<div className="flex-1" />
			</nav>

			<div className="mt-2 space-y-5 text-sm">
				<section aria-labelledby="how-to-search" className="space-y-2">
					<h2 id="how-to-search" className="font-medium">
						How to search
					</h2>
					<p className="text-muted-foreground">
						Press{" "}
						<span className="inline-flex items-center gap-0.5 align-middle">
							<Kbd>ctrl</Kbd>
							<Kbd>k</Kbd>
						</span>{" "}
						to focus the search bar and <Kbd>Enter</Kbd> to search. When using{" "}
						<strong>All</strong>, websearch syntax is supported:
					</p>
					<ul className="space-y-1 rounded-md border border-border bg-card px-3 py-2 text-muted-foreground">
						<li>
							<code className="rounded bg-accent px-1 py-0.5 text-foreground">
								touhou reitaisai
							</code>{" "}
							&mdash; matches both terms
						</li>
						<li>
							<code className="rounded bg-accent px-1 py-0.5 text-foreground">
								&quot;undead corporation&quot;
							</code>{" "}
							&mdash; exact phrase
						</li>
						<li>
							<code className="rounded bg-accent px-1 py-0.5 text-foreground">
								iosys OR alstroemeria
							</code>{" "}
							&mdash; either term (uppercase{" "}
							<code className="rounded bg-accent px-1 py-0.5 text-foreground">
								OR
							</code>
							)
						</li>
						<li>
							<code className="rounded bg-accent px-1 py-0.5 text-foreground">
								imperial circus -dead
							</code>{" "}
							&mdash; exclude a term
						</li>
					</ul>
				</section>

				<section aria-labelledby="search-types" className="space-y-2">
					<h2 id="search-types" className="font-medium">
						Search types
					</h2>
					<dl className="divide-y divide-border rounded-md border border-border bg-card">
						<div className="px-3 py-2">
							<dt className="font-medium">All (default)</dt>
							<dd className="text-muted-foreground">
								Full-text search across circles, releases, and tracks, ranked by
								relevance. Supports the operators above as well as CJK and EN/romaji
								queries (romaji matches kana/kanji names).
							</dd>
						</div>
						<div className="px-3 py-2">
							<dt className="font-medium">Circles</dt>
							<dd className="text-muted-foreground">
								Case-insensitive substring match on circle names only.
							</dd>
						</div>
						<div className="px-3 py-2">
							<dt className="font-medium">Releases</dt>
							<dd className="text-muted-foreground">
								Case-insensitive substring match on release names only; filters each
								circle&apos;s releases to matches.
							</dd>
						</div>
					</dl>
				</section>

				<section aria-labelledby="tracks-toggle" className="space-y-2">
					<h2 id="tracks-toggle" className="font-medium">
						Exclude / Include tracks
					</h2>
					<dl className="divide-y divide-border rounded-md border border-border bg-card">
						<div className="px-3 py-2">
							<dt className="font-medium">Exclude tracks (default)</dt>
							<dd className="text-muted-foreground">
								Hides tracklists for compact results and faster loading.
							</dd>
						</div>
						<div className="px-3 py-2">
							<dt className="font-medium">Include tracks</dt>
							<dd className="text-muted-foreground">
								Fetches and displays the alphabetically sorted tracklist for each
								release.
							</dd>
						</div>
					</dl>
				</section>
			</div>
		</main>
	);
}
