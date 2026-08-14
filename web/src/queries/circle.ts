import { takeIf, takeMapped } from "@jabascript/core";
import { infiniteQueryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { sql } from "drizzle-orm";
import z from "zod";

import { authMiddleware } from "@/integrations/auth";
import { loggingMiddleware } from "@/integrations/logging";

import { db } from "@/db";

const PAGE_SIZE = 100;

export const fetchCirclesInput = z.object({
	search: z.string().trim().optional(),
	// Plain id cursor. Used for browse mode (no search) and ilike searches,
	// where results are ordered by id and a single btree-indexed keyset works.
	cursor: z.number().optional(),
	// Only set (alongside `cursor`) when sorting by relevance. Postgres needs
	// BOTH values to resume correctly: rank alone isn't unique (ties happen),
	// and id alone no longer matches the sort order once we sort by rank.
	cursorRank: z.number().optional(),
	searchType: z.enum(["all", "circle", "release"]).optional().default("all"),
	includeTracks: z.boolean().optional().default(false),
});

// TODO: Once the prepared statement bug is fixed, migrate this to use prepared statements.
// When using the query as a prepared statement with any values being passed into the where clause,
// the query will not return any results.
export const fetchCircles = createServerFn({ method: "GET" })
	.validator(fetchCirclesInput)
	.middleware([authMiddleware, loggingMiddleware])
	.handler(async ({ data: { search, cursor, cursorRank, searchType, includeTracks } }) => {
		const sv = takeIf(search, (x) => x !== undefined && x !== "") ?? undefined;
		const svs = takeMapped(sv, (x) => `%${x}%`) ?? undefined;

		const clause: Parameters<typeof db.query.circle.findMany>["0"] = {
			orderBy: { id: "asc" },
			where: { id: { gt: cursor } },
			with: {},
		};

		switch (searchType) {
			case "circle":
				clause.where!.name = { ilike: svs };
				break;
			case "release":
				clause.where!.releases = { name: { ilike: svs } };
				clause.with!.releases = { where: { name: { ilike: svs } } };
				break;
			case "all": {
				if (sv !== undefined) {
					clause.where = {
						RAW: (t) => {
							const match = sql`${t.searchVector} @@ websearch_to_tsquery('simple', ${sv})`;
							const rank = sql`ts_rank(${t.searchVector}, websearch_to_tsquery('simple', ${sv}))`;

							// Composite keyset: rows ranked strictly below where the last
							// page ended, OR tied on rank but with a smaller id (id is
							// just a deterministic tiebreaker among equal ranks).
							const afterCursor =
								cursor !== undefined && cursorRank !== undefined
									? sql`(${rank}, ${t.id}) < (${cursorRank}, ${cursor})`
									: sql`true`;

							return sql`${match} AND ${afterCursor}`;
						},
					};

					// Only pay for ts_rank when we're actually going to sort/paginate by it.
					clause.extras = {
						rank: (t, { sql }) =>
							sql<number>`ts_rank(${t.searchVector}, websearch_to_tsquery('simple', ${sv}))`,
					};

					clause.orderBy = (t) =>
						sql`ts_rank(${t.searchVector}, websearch_to_tsquery('simple', ${sv})) desc, ${t.id} desc`;
				}
			}
		}

		const query = await db.query.circle.findMany({
			limit: PAGE_SIZE,
			columns: {
				id: true,
				name: true,
				status: true,
				statusText: true,
				missingLink: true,
				megaLinks: true,
			},
			where: clause.where,
			with: {
				releases: {
					columns: { id: true, name: true, sizeMb: true, megaLink: true },
					with: {
						tracks: !includeTracks
							? undefined
							: { columns: { id: true, name: true }, orderBy: { name: "asc" } },
					},
					...(clause.with?.releases ?? ({} as unknown as {})),
				},
			},
			extras: clause.extras,
			orderBy: clause.orderBy,
		});

		return {
			circles: query,
		};
	});

export type FetchCirclesShape = Awaited<ReturnType<typeof fetchCircles>>;

type CirclesPageParam = { cursor?: number; cursorRank?: number } | undefined;

export const circlesInfiniteQueryOptions = ({
	search,
	searchType,
	includeTracks,
}: z.input<typeof fetchCirclesInput>) =>
	infiniteQueryOptions({
		queryKey: ["circles", search, searchType, includeTracks],
		initialPageParam: undefined as CirclesPageParam,
		queryFn: ({ pageParam }) =>
			fetchCircles({
				data: {
					search,
					searchType,
					includeTracks,
					cursor: pageParam?.cursor,
					cursorRank: pageParam?.cursorRank,
				},
			}),
		getNextPageParam: (lastPage): CirclesPageParam => {
			if (lastPage.circles.length < PAGE_SIZE) return undefined;
			const last = lastPage.circles.at(-1) as
				| ((typeof lastPage.circles)[number] & { rank?: number })
				| undefined;
			if (!last) return undefined;
			return { cursor: last.id, cursorRank: last.rank };
		},
	});
