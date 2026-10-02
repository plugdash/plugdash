import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

// Functional tests for @plugdash/readtime on an EmDash blog-template site.
// Env: READTIME_BASE_URL (default http://localhost:4321), READTIME_LOG (path to .astro/dev.log, optional).
// The site's post page must render <ReadingTime post={post} wordsPerMinute={Number(?wpm) || undefined} />.
// Run: pnpm playwright test e2e/readtime.spec.ts

const BASE = process.env.READTIME_BASE_URL ?? "http://localhost:4321";
const LOG = process.env.READTIME_LOG;
const HEADERS = { "X-EmDash-Request": "1", "Content-Type": "application/json" };
const words = (n: number) => Array.from({ length: n }, () => "word").join(" ");

test.describe("ReadingTime renders at publish time", () => {
	let id = "";
	const slug = `rt-e2e-${Date.now()}`;

	test.beforeAll(async ({ request }) => {
		await request.get(`${BASE}/_emdash/api/setup/dev-bypass?redirect=/_emdash/admin`);
		const created = await request.post(`${BASE}/_emdash/api/content/posts`, {
			headers: HEADERS,
			data: {
				slug,
				data: {
					title: "Readtime e2e",
					content: [
						{
							_type: "block",
							_key: "a",
							style: "normal",
							markDefs: [],
							children: [{ _type: "span", _key: "s", text: words(1200), marks: [] }],
						},
					],
				},
			},
		});
		const body = (await created.json()) as { data: { item?: { id: string }; id?: string } };
		id = (body.data.item ?? body.data).id as string;
		await request.post(`${BASE}/_emdash/api/content/posts/${id}/publish`, {
			headers: HEADERS,
			data: {},
		});
	});

	test("1200 words shows 6 min read", async ({ page }) => {
		await page.goto(`${BASE}/posts/${slug}`);
		await expect(page.locator(".plugdash-rt").first()).toContainText("6 min read");
	});

	test("wordsPerMinute=200 still gives 6", async ({ page }) => {
		await page.goto(`${BASE}/posts/${slug}?wpm=200`);
		await expect(page.locator(".plugdash-rt").first()).toContainText("6 min read");
	});

	test("autosave writes no readtime log line", async ({ request }) => {
		test.skip(!LOG, "READTIME_LOG not set");
		const before = readFileSync(LOG!, "utf8").length;
		await request.put(`${BASE}/_emdash/api/content/posts/${id}`, {
			headers: HEADERS,
			data: { data: { excerpt: "x" }, skipRevision: true },
		});
		const added = readFileSync(LOG!, "utf8").slice(before);
		expect(added).not.toContain("[plugin:readtime]");
	});
});
