import { readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";

// autobuild has no UI, so these tests drive the content API and read the
// plugin log. EmDash blocks loopback hosts for plugin fetches, so a log line
// "webhook failed" or "webhook fired" counts as "the hook was called".
//
// Env:
//   BASE_URL         site origin, default http://127.0.0.1:5124
//   AUTOBUILD_LOG    path to the server log (dev: site/.astro/dev.log)
//   AUTOBUILD_COOKIE session cookie header value (omit in dev: dev-bypass is used)
//   AUTOBUILD_DEBOUNCE_MS  debounceMs set in astro.config.mjs, default 1000
//
// Site config: autobuildPlugin({ hookUrl: "https://autobuild-test.invalid/hook",
// debounceMs: 1000 }). Tag: @prod tests also run against a production build.

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:5124";
const LOG = process.env.AUTOBUILD_LOG;
const DEBOUNCE = Number(process.env.AUTOBUILD_DEBOUNCE_MS ?? 1000);
const SETTLE = DEBOUNCE + 2500;

const fired = () =>
	LOG ? (readFileSync(LOG, "utf8").match(/webhook (failed|fired|non-2xx)/g) ?? []).length : 0;

test.describe.configure({ mode: "serial" });
test.skip(!LOG, "set AUTOBUILD_LOG to the server log path");

let headers: Record<string, string>;

test.beforeAll(async ({ request }) => {
	headers = { "X-EmDash-Request": "1", "Content-Type": "application/json" };
	if (process.env.AUTOBUILD_COOKIE) {
		headers.Cookie = process.env.AUTOBUILD_COOKIE;
	} else {
		await request.get(`${BASE}/_emdash/api/setup/dev-bypass?redirect=/_emdash/admin`);
	}
});

const api = (path: string) => `${BASE}/_emdash/api/content/posts${path}`;

async function create(request: import("@playwright/test").APIRequestContext, slug: string) {
	const res = await request.post(api(""), {
		headers,
		data: { data: { title: slug, content: [] }, slug },
	});
	expect(res.ok()).toBeTruthy();
	return (await res.json()).data.item.id as string;
}

test("@prod publish fires once, autosaves fire nothing, unpublish fires once", async ({
	request,
	page,
}) => {
	const slug = `autobuild-${Date.now()}`;
	const id = await create(request, slug);
	const base = fired();

	await request.post(api(`/${id}/publish`), { headers, data: {} });
	await page.waitForTimeout(SETTLE);
	expect(fired() - base).toBe(1);

	for (let i = 0; i < 10; i++) {
		await request.put(api(`/${id}`), {
			headers,
			data: { data: { title: `${slug} ${i}` }, skipRevision: true },
		});
	}
	await page.waitForTimeout(SETTLE);
	expect(fired() - base).toBe(1);

	await request.post(api(`/${id}/unpublish`), { headers, data: {} });
	await page.waitForTimeout(SETTLE);
	expect(fired() - base).toBe(2);
});

test("@prod deleting a never-published draft fires nothing", async ({ request, page }) => {
	const id = await create(request, `autobuild-draft-${Date.now()}`);
	const base = fired();
	await request.delete(api(`/${id}`), { headers });
	await page.waitForTimeout(SETTLE);
	expect(fired() - base).toBe(0);
});
