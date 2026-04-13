import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import z from "zod";

import { db } from "@/db";

export const fetchCirclesInput = z.object({
	limit: z.number().optional().default(1000),
	search: z.string().optional(),
	cursor: z.number().optional(),
	searchType: z.enum(["release", "circle"]).optional().default("release"),
});

export const fetchCircles = createServerFn({ method: "GET" })
	.inputValidator(fetchCirclesInput)
	.handler(async ({ data: { limit, search, cursor, searchType } }) => {
		const query = await db.query.circle.findMany({
			limit,
			where: {
				id: { gt: cursor },
				name: { ilike: search ? `%${search}%` : undefined },
			},
			with: {
				releases: {
					columns: { id: true, name: true, sizeMb: true, megaLink: true },
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

export const circlesQueryOptions = ({ search, limit, cursor }: z.input<typeof fetchCirclesInput>) =>
	queryOptions({
		queryKey: ["circles", search, limit, cursor],
		queryFn: () => fetchCircles({ data: { search, limit, cursor } }),
	});
