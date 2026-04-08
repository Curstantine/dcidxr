import { action, query, redirect } from "@solidjs/router";
import { getSession } from "./auth.server";

// Define routes that require being logged in
const PROTECTED_ROUTES = ["/"];

const isProtected = (path: string) =>
	PROTECTED_ROUTES.some((route) =>
		route.endsWith("/*")
			? path.startsWith(route.slice(0, -2))
			: path === route || path.startsWith(route + "/"),
	);

export const querySession = query(async (path: string) => {
	"use server";
	const { data } = await getSession();
	if (path === "/login" && data.id) return redirect("/");
	if (data.id) return data;
	if (isProtected(path)) throw redirect(`/login?redirect=${path}`);
	return null;
}, "session");

export const logout = action(async () => {
	"use server";
	const session = await getSession();
	await session.update({ id: undefined });
	throw redirect("/login", { revalidate: "session" });
});
