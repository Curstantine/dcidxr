import { infiniteQueryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import z from "zod";

import { db } from "@/db";

const PAGE_SIZE = 100;

export const fetchCirclesInput = z.object({
	search: z.string().optional(),
	cursor: z.number().optional(),
	searchType: z.enum(["circle", "release"]).optional().default("circle"),
});

// TODO: Once the prepared statement bug is fixed, migrate this to use prepared statements.
// When using the query as a prepared statement with any values being passed into the where clause,
// the query will not return any results.
export const fetchCircles = createServerFn({ method: "GET" })
	.inputValidator(fetchCirclesInput)
	.handler(async ({ data: { search, cursor, searchType } }) => {
		const searchValue = search ? `%${search}%` : undefined;

		const query = await db.query.circle.findMany({
			limit: PAGE_SIZE,
			where: {
				id: { gt: cursor },
				name: searchType === "circle" ? { ilike: searchValue } : undefined,
				releases: {
					name: searchType === "release" ? { ilike: searchValue } : undefined,
				},
			},
			with: {
				releases: {
					columns: { id: true, name: true, sizeMb: true, megaLink: true },
					where: {
						name:
							searchType === "release"
								? { ilike: search ? `%${search}%` : undefined }
								: undefined,
					},
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
