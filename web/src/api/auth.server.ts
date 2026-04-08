import { redirect } from "@solidjs/router";
import { useSession } from "@solidjs/start/http";

export interface Session {
	id: number;
	email: string;
}

export const getSession = () => {
	const sessionSecret = process.env.SESSION_SECRET;
	if (!sessionSecret) throw new Error("SESSION_SECRET is required");
	return useSession<Session>({ password: sessionSecret });
};

export async function createSession(user: Session, redirectTo?: string) {
	const validDest = redirectTo?.[0] === "/" && redirectTo[1] !== "/";
	const session = await getSession();
	await session.update(user);
	return redirect(validDest ? redirectTo : "/");
}
