import { defineRelations } from "drizzle-orm";
import * as schema from "./schema";

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
}));
