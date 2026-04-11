import { defineRelations } from "drizzle-orm";

import * as schema from "@/db/schema";

export const relations = defineRelations(schema, (r) => ({
	account: {
		user: r.one.user({ from: r.account.userId, to: r.user.id }),
	},
	session: {
		user: r.one.user({ from: r.session.userId, to: r.user.id }),
	},
	user: {
		accounts: r.many.account(),
		sessions: r.many.session(),
	},
	release: {
		circle: r.one.circle({ from: r.release.circleId, to: r.circle.id }),
	},
	circle: {
		releases: r.many.release(),
	},
}));
