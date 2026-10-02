import { readFileSync } from "node:fs";
import { expect, test, type APIRequestContext } from "@playwright/test";

// Functional tests for @plugdash/socialcard.
// Needs an EmDash dev site (blog template) with socialcardPlugin() in
// `plugins`. Point BASE_URL at it and DEV_LOG at its .astro/dev.log so the
// skip checks can read the plugin's log lines.
// Run: BASE_URL=http://127.0.0.1:4321 DEV_LOG=path/to/.astro/dev.log pnpm playwright test e2e/socialcard.spec.ts

const BASE_URL = process.env.BASE_URL ?? "http://localhost:4321";
const DEV_LOG = process.env.DEV_LOG ?? ".astro/dev.log";
const API = `${BASE_URL}/_emdash/api/content/posts`;
const headers = { "X-EmDash-Request": "1" };

// The hook runs after the publish response, so poll instead of sleeping.
async function ogImage(request: APIRequestContext, slug: string): Promise<string | null> {
	const html = await (await request.get(`${BASE_URL}/posts/${slug}`)).text();
	return html.match(/<meta property="og:image" content="([^"]+)"/)?.[1] ?? null;
}

function logCount(line: string): number {
	return readFileSync(DEV_LOG, "utf8").split(line).length - 1;
}

test.describe.serial("socialcard", () => {
	const slug = `socialcard-e2e-${Date.now()}`;
	let id = "";
	let firstUrl = "";

	test.beforeAll(async ({ request }) => {
		await request.get(`${BASE_URL}/_emdash/api/setup/dev-bypass?redirect=/_emdash/admin`);
		const res = await request.post(API, {
			headers,
			data: {
				slug,
				data: {
					title: "Socialcard e2e post",
					content: [
						{
							_type: "block",
							_key: "a",
							style: "normal",
							children: [{ _type: "span", _key: "b", text: "Hello" }],
						},
					],
				},
			},
		});
		expect(res.ok()).toBe(true);
		id = (await res.json()).data.item.id;
	});

	test("publish sets og:image to a PNG that loads", async ({ request }) => {
		expect((await request.post(`${API}/${id}/publish`, { headers, data: {} })).ok()).toBe(true);
		await expect.poll(() => ogImage(request, slug), { timeout: 15_000 }).toMatch(/\.png$/);
		firstUrl = (await ogImage(request, slug))!;
		// Absolute, built from the request origin at render time.
		expect(firstUrl.startsWith(new URL(BASE_URL).origin)).toBe(true);
		const png = await request.get(firstUrl);
		expect(png.status()).toBe(200);
		expect(png.headers()["content-type"]).toBe("image/png");
	});

	test("re-publish with no change does not upload", async ({ request }) => {
		const before = logCount("card unchanged, skipping render");
		const generated = logCount("card generated");
		expect((await request.post(`${API}/${id}/publish`, { headers, data: {} })).ok()).toBe(true);
		await expect
			.poll(() => logCount("card unchanged, skipping render"), { timeout: 10_000 })
			.toBe(before + 1);
		expect(logCount("card generated")).toBe(generated);
		expect(await ogImage(request, slug)).toBe(firstUrl);
	});

	test("autosave does nothing", async ({ request }) => {
		const generated = logCount("card generated");
		const skipped = logCount("card unchanged, skipping render");
		const res = await request.put(`${API}/${id}`, {
			headers,
			data: { data: { excerpt: "autosaved" }, skipRevision: true },
		});
		expect(res.ok()).toBe(true);
		await new Promise((r) => setTimeout(r, 3000));
		expect(logCount("card generated")).toBe(generated);
		expect(logCount("card unchanged, skipping render")).toBe(skipped);
		expect(await ogImage(request, slug)).toBe(firstUrl);
	});
});
