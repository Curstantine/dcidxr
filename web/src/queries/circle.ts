import { takeIf, takeMapped } from "@jabascript/core";
import { infiniteQueryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { sql } from "drizzle-orm";
import z from "zod";

import { db } from "@/db";

const PAGE_SIZE = 100;

export const fetchCirclesInput = z.object({
	search: z.string().trim().optional(),
	cursor: z.number().optional(),
	searchType: z.enum(["all", "circle", "release"]).optional().default("all"),
});

// TODO: Once the prepared statement bug is fixed, migrate this to use prepared statements.
// When using the query as a prepared statement with any values being passed into the where clause,
// the query will not return any results.
export const fetchCircles = createServerFn({ method: "GET" })
	.inputValidator(fetchCirclesInput)
	.handler(async ({ data: { search, cursor, searchType } }) => {
		const sv = takeIf(search, (x) => x !== undefined && x !== "") ?? undefined;
		const svs = takeMapped(sv, (x) => `%${x}%`) ?? undefined;

		let clause: Parameters<typeof db.query.circle.findMany>["0"];

		switch (searchType) {
			case "circle":
				clause = {
					where: { name: { ilike: svs } },
				};
				break;
			case "release":
				clause = {
					where: { releases: { name: { ilike: svs } } },
					with: { releases: { where: { name: { ilike: svs } } } },
				};
				break;
			case "all": {
				if (sv === undefined) clause = {};
				else
					clause = {
						where: {
							RAW: (t) =>
								sql`${t.searchVector} @@ websearch_to_tsquery('simple', ${sv})`,
						},
					};

				break;
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
			where: {
				...clause.where,
				id: { gt: cursor },
			},
			with: {
				releases: {
					columns: { id: true, name: true, sizeMb: true, megaLink: true },
					// biome-ignore lint/complexity/noBannedTypes: I don't know...
					...(clause.with?.releases ?? ({} as unknown as {})),
				},
			},
		});

		return {
			circles: query,
			total: {
				circles: query.length,
				releases: query.reduce((x, { releases }) => x + releases.length, 0),
			},
		};
	});

export type FetchCirclesShape = Awaited<ReturnType<typeof fetchCircles>>;

export const circlesInfiniteQueryOptions = ({
	search,
	searchType,
}: z.input<typeof fetchCirclesInput>) =>
	infiniteQueryOptions({
		queryKey: ["circles", search, searchType],
		initialPageParam: undefined as number | undefined,
		queryFn: ({ pageParam }) =>
			fetchCircles({ data: { search, searchType, cursor: pageParam } }),
		getNextPageParam: (lastPage) => {
			return lastPage.circles.length < PAGE_SIZE ? undefined : lastPage.circles.at(-1)?.id;
		},
	});
