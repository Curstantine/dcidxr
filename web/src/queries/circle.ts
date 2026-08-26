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
	cursor: z.number().optional(),
	cursorRank: z.number().optional(),
	searchType: z.enum(["all", "circle", "release"]).optional().default("all"),
	includeTracks: z.boolean().optional().default(false),
});

export const fetchCircles = createServerFn({ method: "GET" })
	.validator(fetchCirclesInput)
	.middleware([authMiddleware, loggingMiddleware])
	.handler(async ({ data: { search, cursor, cursorRank, searchType, includeTracks } }) => {
		const sv = takeIf(search, (x) => x !== undefined && x !== "") ?? undefined;
		const svs = takeMapped(sv, (x) => `%${x}%`) ?? undefined;

		const clause: Parameters<typeof db.query.circle.findMany>["0"] = {
			orderBy: { id: "asc" },
			where: cursor !== undefined ? { id: { gt: cursor } } : undefined,
			with: {},
		};

		switch (searchType) {
			case "circle":
				clause.where = { ...clause.where, name: { ilike: svs } };
				break;
			case "release":
				clause.where = { ...clause.where, releases: { name: { ilike: svs } } };
				clause.with!.releases = { where: { name: { ilike: svs } } };
				break;
			case "all": {
				if (sv !== undefined) {
					const matchQuery = sql`websearch_to_tsquery('simple', ${sv})`;

					clause.where = {
						RAW: (t) => {
							const match = sql`${t.searchVector} @@ ${matchQuery}`;
							const rank = sql`ts_rank(${t.searchVector}, ${matchQuery})`;

							const afterCursor =
								cursor !== undefined && cursorRank !== undefined
									? sql`(${rank}, ${t.id}) < (${cursorRank}, ${cursor})`
									: sql`true`;

							return sql`${match} AND ${afterCursor}`;
						},
					};

					clause.extras = {
						rank: (t) => sql<number>`ts_rank(${t.searchVector}, ${matchQuery})`,
					};

					clause.orderBy = (t) =>
						sql`ts_rank(${t.searchVector}, ${matchQuery}) desc, ${t.id} desc`;
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
