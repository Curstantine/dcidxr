import { keepPreviousData, queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import z from "zod";

import { db } from "@/db";

export const fetchCirclesInput = z.object({
	limit: z.number().optional().default(1000),
	search: z.string().optional(),
	cursor: z.number().optional(),
	searchType: z.enum(["circle", "release"]).optional().default("circle"),
});

// TODO: Once the prepared statement bug is fixed, migrate this to use prepared statements.
// When using the query as a prepared statement with any values being passed into the where clause,
// the query will not return any results.
export const fetchCircles = createServerFn({ method: "GET" })
	.inputValidator(fetchCirclesInput)
	.handler(async ({ data: { limit, search, cursor, searchType } }) => {
		const query = await db.query.circle.findMany({
			limit,
			where: {
				id: { gt: cursor },
				name:
					searchType === "circle"
						? { ilike: search ? `%${search}%` : undefined }
						: undefined,
				releases: {
					name:
						searchType === "release"
							? { ilike: search ? `%${search}%` : undefined }
							: undefined,
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

export const circlesQueryOptions = ({
	search,
	limit,
	cursor,
	searchType,
}: z.input<typeof fetchCirclesInput>) =>
	queryOptions({
		queryKey: ["circles", search, limit, cursor, searchType],
		placeholderData: keepPreviousData,
		queryFn: () => fetchCircles({ data: { search, limit, cursor, searchType } }),
	});
