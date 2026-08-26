import type { MockServerOptions } from "../types.ts";

export async function handleLogin(data: any, options: MockServerOptions): Promise<any> {
	const loginData = options.state!.loginData.get(data.uh);
	if (!loginData) return -9;

	return loginData;
}
