import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { db } from "@/db";

export const fetchServerMeta = createServerFn({ method: "GET" }).handler(async () => {
	const query = await db.query.serverMeta.findMany({
		where: {
			key: { OR: ["last_crawled", "last_indexed"] },
		},
	});

	return query;
});

export type FetchServerMetaShape = Awaited<ReturnType<typeof fetchServerMeta>>;

export const serverMetaQueryOptions = queryOptions({
	queryKey: ["serverMeta"],
	queryFn: fetchServerMeta,
	refetchOnWindowFocus: false,
	refetchInterval: false,
});
