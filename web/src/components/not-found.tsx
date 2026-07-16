import { Link } from "@tanstack/react-router";

export function NotFound() {
	return (
		<div className="flex min-h-screen flex-col items-center justify-center gap-4">
			<h1 className="text-4xl font-bold">404</h1>
			<p className="text-lg text-muted-foreground">
				The page you&apos;re looking for doesn&apos;t exist.
			</p>
			<Link to="/" className="text-primary hover:underline">
				Go back home
			</Link>
		</div>
	);
}
