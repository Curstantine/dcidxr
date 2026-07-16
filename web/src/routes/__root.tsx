import { TanStackDevtools } from "@tanstack/react-devtools";
import { createRootRouteWithContext, HeadContent, Scripts } from "@tanstack/react-router";
import { Analytics } from "@vercel/analytics/react";

import { NotFound } from "@/components/not-found";
import { Toaster } from "@/components/sonner";

import TanstackPacerDevtools from "@/integrations/pacer/devtools";
import TanStackQueryDevtools from "@/integrations/query/devtools";
import TanStackRouterDevtools from "@/integrations/router/devtools";

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

function RootDocument({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en" suppressHydrationWarning>
			<head>
				<HeadContent />
			</head>
			<body className="font-sans wrap-anywhere antialiased selection:bg-[rgba(79,184,178,0.24)]">
				{children}
				<TanStackDevtools
					eventBusConfig={{ debug: false }}
					config={{ position: "bottom-right" }}
					plugins={[TanStackRouterDevtools, TanStackQueryDevtools, TanstackPacerDevtools]}
				/>
				<Scripts />
				<Toaster />
				{import.meta.env.PROD && <Analytics />}
			</body>
		</html>
	);
}
