import { createMiddleware } from "@tanstack/react-start";

export const loggingMiddleware = createMiddleware().server(async ({ next, serverFnMeta }) => {
	const startTime = performance.now();
	const result = await next();
	const duration = (performance.now() - startTime).toFixed(2);

	console.debug(`[${serverFnMeta?.name}::perf]: Execution took ${duration}ms`);

	return result;
});
