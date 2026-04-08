import { Title } from "@solidjs/meta";

export default function NotFound() {
	return (
		<main class="text-center">
			<Title>Page Not Found</Title>
			<h1>Not Found</h1>
			Sorry, the page you’re looking for doesn't exist
			<a
				href="/"
				class="rounded-xl border border-gray-300 px-4 py-2 text-gray-700 transition-colors duration-200 hover:bg-gray-100"
			>
				Go Home
			</a>
		</main>
	);
}
