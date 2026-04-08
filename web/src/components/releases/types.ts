import type { queryReleases } from "~/api/releases";

export type ReleaseList = Awaited<ReturnType<typeof queryReleases>>;
export type Release = ReleaseList[number];
