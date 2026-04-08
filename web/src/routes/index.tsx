import { Title } from "@solidjs/meta";
import { createAsync, useSearchParams } from "@solidjs/router";
import { createMemo } from "solid-js";

import { queryReleases } from "~/api/releases";
import { useAuth } from "~/components/Context";
import ReleasePageHeader from "~/components/releases/ReleasePageHeader";
import ReleaseResults from "~/components/releases/ReleaseResults";
import ReleaseSearchForm from "~/components/releases/ReleaseSearchForm";

export default function Home() {
	const { session } = useAuth();
	const [spms] = useSearchParams();
	const query = createMemo(() => (typeof spms.q === "string" ? spms.q : ""));
	const search = createMemo(() => query().trim());
	const releases = createAsync(() => queryReleases(search()), { deferStream: true });

	return (
		<main class="items-stretch! justify-start! gap-6! bg-slate-50! pt-24! pb-8!">
			<Title>Releases</Title>
			<section class="mx-auto w-full max-w-5xl space-y-5">
				<ReleasePageHeader email={session()?.email} />
				<ReleaseSearchForm query={query()} showClear={search().length > 0} />
				<ReleaseResults items={releases()} search={search()} />
			</section>
		</main>
	);
}
