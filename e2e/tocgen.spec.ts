import { test, expect } from "@playwright/test";

// Functional tests for @plugdash/tocgen on an EmDash blog-template site.
// Env: TOCGEN_BASE_URL (default http://localhost:4321).
// The site's post page must render <TableOfContents post={post} /> and
// <HeadingAnchors /> after the body, and drop the template's own toc.
// Run: pnpm playwright test e2e/tocgen.spec.ts

const BASE = process.env.TOCGEN_BASE_URL ?? "http://localhost:4321";
const HEADERS = { "X-EmDash-Request": "1", "Content-Type": "application/json" };

const h = (style: string, text: string, i: number) => ({
	_type: "block",
	_key: `k${i}`,
	style,
	markDefs: [],
	children: [{ _type: "span", _key: `s${i}`, text, marks: [] }],
});
const headings: [string, string][] = [
	["h2", "Getting started"],
	["h3", "Install"],
	["h2", "हिंदी शीर्षक"],
	["h2", "दूसरा शीर्षक"],
	["h2", "Émojis & Ünicode"],
	["h2", "Getting started"],
	["h2", "<img src=x onerror=alert(1)>"],
];

test.describe("TableOfContents on the blog template", () => {
	const slug = `toc-e2e-${Date.now()}`;

	test.beforeAll(async ({ request }) => {
		await request.get(`${BASE}/_emdash/api/setup/dev-bypass?redirect=/_emdash/admin`);
		const created = await request.post(`${BASE}/_emdash/api/content/posts`, {
			headers: HEADERS,
			data: {
				slug,
				data: {
					title: "TOC e2e",
					content: headings.flatMap(([s, t], i) => [h(s, t, i), h("normal", `Body ${i}`, 100 + i)]),
				},
			},
		});
		const body = (await created.json()) as { data: { item?: { id: string }; id?: string } };
		const id = (body.data.item ?? body.data).id as string;
		await request.post(`${BASE}/_emdash/api/content/posts/${id}/publish`, { headers: HEADERS, data: {} });
	});

	test("every TOC link has a target, including Hindi headings", async ({ page }) => {
		await page.goto(`${BASE}/posts/${slug}`);
		const links = page.locator(".plugdash-toc a");
		expect(await links.count()).toBe(headings.length);
		const hrefs = await links.evaluateAll((as) => as.map((a) => a.getAttribute("href")!));
		expect(hrefs.every((href) => href.length > 1)).toBe(true);
		expect(new Set(hrefs).size).toBe(hrefs.length);
		for (const href of hrefs) {
			await expect(page.locator(`[id="${href.slice(1)}"]`)).toHaveCount(1);
		}
	});

	test("clicking a link scrolls to the heading", async ({ page }) => {
		await page.goto(`${BASE}/posts/${slug}`);
		await page.locator(".plugdash-toc a", { hasText: "हिंदी शीर्षक" }).click();
		const id = new URL(page.url()).hash.slice(1);
		await expect(page.locator(`[id="${decodeURIComponent(id)}"]`)).toBeInViewport();
	});

	test("heading text is escaped in the TOC", async ({ page }) => {
		await page.goto(`${BASE}/posts/${slug}`);
		await expect(page.locator(".plugdash-toc img")).toHaveCount(0);
	});

	test("only one TOC on the page", async ({ page }) => {
		await page.goto(`${BASE}/posts/${slug}`);
		await expect(page.locator("nav[aria-label='Table of contents']")).toHaveCount(1);
	});
});
