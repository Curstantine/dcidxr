import { defineRelations } from "drizzle-orm";

import * as schema from "@/db/schema";

export const relations = defineRelations(schema, (r) => ({
	release: {
		circle: r.one.circle({
			from: r.release.circleId,
			to: r.circle.id,
			optional: false,
		}),
	},
	circle: {
		releases: r.many.release({
			from: r.circle.id,
			to: r.release.circleId,
		}),
	},
	user: {
		sessions: r.many.session({
			from: r.user.id,
			to: r.session.userId,
		}),
		accounts: r.many.account({
			from: r.user.id,
			to: r.account.userId,
		}),
	},
}));
