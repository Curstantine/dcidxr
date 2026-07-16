import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { authMiddleware } from "@/integrations/auth";
import { loggingMiddleware } from "@/integrations/logging";

import { db } from "@/db";

export const fetchServerMeta = createServerFn({ method: "GET" })
	.middleware([authMiddleware, loggingMiddleware])
	.handler(async () => {
		return await db.query.serverMeta.findMany({
			where: { key: { OR: ["last_crawled", "last_indexed"] } },
		});
	});

export type FetchServerMetaShape = Awaited<ReturnType<typeof fetchServerMeta>>;

export const serverMetaQueryOptions = queryOptions({
	queryKey: ["serverMeta"],
	queryFn: fetchServerMeta,
	refetchOnWindowFocus: false,
	refetchInterval: false,
});
