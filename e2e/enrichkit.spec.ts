import { readFileSync } from "node:fs";
import { test, expect, type APIRequestContext } from "@playwright/test";

// Functional tests for @plugdash/enrichkit. No real LLM API is called.
//
// Needs a dev site with enrichkitPlugin() registered, EMDASH_ENCRYPTION_KEY
// set and an apiKey secret saved (any string). The plugin logs "calling
// provider" once per would-be paid call, so the tests count that line in the
// server log. EmDash's SSRF guard blocks ctx.http.fetch to loopback, so the
// provider call itself fails or is rerouted outside the plugin; only the
// attempt count matters here.
//
// Run: ENRICHKIT_LOG=/path/to/site/.astro/dev.log BASE_URL=http://127.0.0.1:4321 \
//   pnpm playwright test e2e/enrichkit.spec.ts

const BASE_URL = process.env.BASE_URL ?? "http://localhost:4321";
const LOG = process.env.ENRICHKIT_LOG ?? "";
const POSTS = `${BASE_URL}/_emdash/api/content/posts`;
const HEADERS = { "X-EmDash-Request": "1" };

const attempts = () => (readFileSync(LOG, "utf8").match(/calling provider/g) ?? []).length;
const settle = () => new Promise((r) => setTimeout(r, 3000));

const words = Array.from({ length: 150 }, (_, i) => `word${i}`).join(" ");
const content = [
	{
		_type: "block",
		_key: "b1",
		style: "normal",
		children: [{ _type: "span", _key: "s1", text: words }],
	},
];

async function createPost(request: APIRequestContext, title: string): Promise<string> {
	await request.get(`${BASE_URL}/_emdash/api/setup/dev-bypass?redirect=/_emdash/admin`);
	const res = await request.post(POSTS, {
		headers: HEADERS,
		data: { data: { title, content }, slug: `enrichkit-${Date.now()}` },
	});
	expect(res.ok()).toBe(true);
	return (await res.json()).data.item.id;
}

test.describe("enrichkit cost guards", () => {
	test.skip(!LOG, "set ENRICHKIT_LOG to the site's server log");

	test("same content published twice makes one provider attempt", async ({ request }) => {
		const id = await createPost(request, "enrichkit twice");
		const before = attempts();
		await request.post(`${POSTS}/${id}/publish`, { headers: HEADERS, data: {} });
		await settle();
		await request.post(`${POSTS}/${id}/publish`, { headers: HEADERS, data: {} });
		await settle();
		expect(attempts() - before).toBe(1);
	});

	test("10 autosaves on a published post make no provider attempt", async ({ request }) => {
		const id = await createPost(request, "enrichkit autosave");
		await request.post(`${POSTS}/${id}/publish`, { headers: HEADERS, data: {} });
		await settle();
		const before = attempts();
		for (let i = 0; i < 10; i++) {
			await request.put(`${POSTS}/${id}`, {
				headers: HEADERS,
				data: { data: { title: `autosave ${i}`, content }, skipRevision: true },
			});
		}
		await settle();
		expect(attempts() - before).toBe(0);
	});
});
