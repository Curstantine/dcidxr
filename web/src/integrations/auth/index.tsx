import { createMiddleware } from "@tanstack/react-start";

import { ensureSessionUtil } from "@/auth/func";

export const authMiddleware = createMiddleware().server(async ({ next }) => {
	const auth = await ensureSessionUtil();
	return await next({ context: { auth } });
});
