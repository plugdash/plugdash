import { expect, test } from "@playwright/test";

// Functional tests for @plugdash/shortlink (native EmDash redirects).
// Needs a dev site with shortlinkPlugin() registered and a posts page at
// /posts/[slug] that renders <CopyLink post={post} />.
// Run: BASE_URL=http://127.0.0.1:5120 pnpm playwright test e2e/shortlink.spec.ts
// Auth uses the dev-bypass endpoint, so point it at `astro dev`, not a prod build.

const BASE_URL = process.env.BASE_URL ?? "http://127.0.0.1:4321";
const H = { "X-EmDash-Request": "1" };

const shortCode = (id: string) => id.slice(-8).toLowerCase();

test.describe("shortlink", () => {
	test.beforeEach(async ({ request }) => {
		await request.get(`${BASE_URL}/_emdash/api/setup/dev-bypass`);
	});

	test("publish creates a one-hop 301 that survives a slug change", async ({ request, page }) => {
		const slug = `sl-e2e-${Date.now()}`;
		const created = await request.post(`${BASE_URL}/_emdash/api/content/posts`, {
			headers: H,
			data: { data: { title: "Shortlink e2e" }, slug },
		});
		expect(created.ok()).toBe(true);
		const id: string = (await created.json()).data.item.id;
		const source = `/s/${shortCode(id)}`;

		await request.post(`${BASE_URL}/_emdash/api/content/posts/${id}/publish`, {
			headers: H,
			data: {},
		});

		// One request, one 301, straight to the post.
		const head = await request.head(`${BASE_URL}${source}`, { maxRedirects: 0 });
		expect(head.status()).toBe(301);
		expect(head.headers().location).toBe(`/posts/${slug}`);

		// Hits are counted by EmDash on the redirect row.
		const list = await request.get(`${BASE_URL}/_emdash/api/redirects?search=${source}`, {
			headers: H,
		});
		const row = (await list.json()).data.items.find((r: { source: string }) => r.source === source);
		expect(row).toMatchObject({ type: 301, groupName: "shortlink" });
		expect(row.hits).toBeGreaterThan(0);

		// CopyLink renders an absolute short URL from the entry id.
		await page.goto(`${BASE_URL}/posts/${slug}`);
		const copy = await page.locator(".plugdash-copy").first().getAttribute("data-copy");
		expect(copy).toBe(new URL(source, page.url()).href);

		// Slug change + republish: the short link still lands on the post.
		await request.put(`${BASE_URL}/_emdash/api/content/posts/${id}`, {
			headers: H,
			data: { slug: `${slug}-new` },
		});
		await request.post(`${BASE_URL}/_emdash/api/content/posts/${id}/publish`, {
			headers: H,
			data: {},
		});
		const moved = await request.get(`${BASE_URL}${source}`);
		expect(moved.status()).toBe(200);
		expect(new URL(moved.url()).pathname).toBe(`/posts/${slug}-new`);
	});

	test("unknown code is a 404", async ({ request }) => {
		const res = await request.head(`${BASE_URL}/s/zzzzzzzz`, { maxRedirects: 0 });
		expect(res.status()).toBe(404);
	});
});
