import { createRootRouteWithContext, HeadContent, Scripts } from "@tanstack/react-router";
import { Analytics } from "@vercel/analytics/react";
import React, { Suspense } from "react";

import { NotFound } from "@/components/not-found";
import { Toaster } from "@/components/sonner";

import type { QueryClient } from "@tanstack/react-query";

import appCss from "../styles.css?url";

interface MyRouterContext {
	queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
	notFoundComponent: NotFound,
	head: () => ({
		meta: [
			{ charSet: "utf-8" },
			{ name: "viewport", content: "width=device-width, initial-scale=1" },
			{ title: "Doujin Cafe Indexer" },
		],
		links: [
			{ rel: "stylesheet", href: appCss },
			{ rel: "icon", type: "image/x-icon", href: "/favicon.ico" },
			{ rel: "icon", type: "image/png", href: "/icon.png" },
			{ rel: "apple-touch-icon", sizes: "180x180", href: "/apple-touch.png" },
			{ rel: "manifest", href: "/manifest.json" },
		],
	}),
	shellComponent: RootDocument,
});

const TanStackDevtools =
	process.env.NODE_ENV === "production"
		? () => null
		: React.lazy(() =>
				Promise.all([
					import("@tanstack/react-devtools"),
					import("@/integrations/router/devtools"),
					import("@/integrations/query/devtools"),
					import("@/integrations/pacer/devtools"),
				]).then(([devtools, routerDevtools, queryDevtools, pacerDevtools]) => ({
					default: () => (
						<devtools.TanStackDevtools
							eventBusConfig={{ debug: false }}
							config={{ position: "bottom-right" }}
							plugins={[
								routerDevtools.default,
								queryDevtools.default,
								pacerDevtools.default,
							]}
						/>
					),
				})),
			);

function RootDocument({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en" suppressHydrationWarning>
			<head>
				<HeadContent />
			</head>
			<body className="font-sans wrap-anywhere antialiased selection:bg-[rgba(79,184,178,0.24)]">
				{children}
				<Suspense>
					<TanStackDevtools />
				</Suspense>
				<Scripts />
				<Toaster />
				{import.meta.env.PROD && <Analytics />}
			</body>
		</html>
	);
}
