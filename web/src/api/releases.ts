import { query } from "@solidjs/router";

import { db } from "./db";

export const queryReleases = query(async (rawSearch: string | undefined) => {
	"use server";

	const search = rawSearch?.trim() ?? "";
	const searchPattern = `%${search}%`;

	return db.query.release.findMany({
		where: {
			name: { ilike: searchPattern },
			circle: { name: { ilike: searchPattern } },
		},

		with: { circle: true },

		orderBy: { id: "desc" },
	});
}, "release");
