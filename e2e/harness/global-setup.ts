// Playwright global setup: starts the dev server (or the production build when
// E2E_MODE=prod), logs in once, and shares the URL and token with workers via
// env vars. Set E2E_BASE_URL to reuse a server you already started.
import { session, startDev, startProd } from "./index";

export default async function globalSetup(): Promise<() => Promise<void>> {
	if (process.env.E2E_BASE_URL) {
		await session();
		return async () => {};
	}
	const server = process.env.E2E_MODE === "prod" ? await startProd() : await startDev();
	if (process.env.E2E_MODE !== "prod") await session();
	return server.stop;
}
