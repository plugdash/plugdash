import { test, expect, type APIRequestContext } from "@playwright/test";

// Functional tests for @plugdash/sharepost on the EmDash blog template.
// The post page renders <ShareButtons post={post} via="abhinavs" /> with all five platforms.
// Env: BASE_URL (default http://127.0.0.1:4321), COOKIE (astro-session value, for the title-change test).
// Run: pnpm playwright test e2e/sharepost.spec.ts

const BASE_URL = process.env.BASE_URL ?? "http://127.0.0.1:4321";
const SLUG = "sharepost-e2e";
const api = { "X-EmDash-Request": "1", "Content-Type": "application/json" };

function textBlock(text: string) {
	return [
		{ _type: "block", _key: "a", style: "normal", children: [{ _type: "span", _key: "b", text }] },
	];
}

async function xHref(page: import("@playwright/test").Page) {
	return (await page.locator(".plugdash-share-btn--twitter").first().getAttribute("href")) ?? "";
}

test.describe("ShareButtons at render time", () => {
	test("all five links carry the absolute post URL, via only on X", async ({ page }) => {
		await page.goto(`${BASE_URL}/posts/${SLUG}`);
		const abs = encodeURIComponent(`${BASE_URL}/posts/${SLUG}`);
		const buttons = page.locator(".plugdash-share-btn");
		await expect(buttons).toHaveCount(5);
		for (const href of await buttons.evaluateAll((els) => els.map((e) => e.getAttribute("href")))) {
			expect(href).toContain(abs);
		}
		const x = await xHref(page);
		expect(x).toContain(`url=${encodeURIComponent(BASE_URL + "/posts/" + SLUG)}`);
		expect(x).toContain("via=abhinavs");
		expect(await page.locator(".plugdash-share-btn--linkedin").getAttribute("href")).not.toContain(
			"abhinavs",
		);
	});

	test("a title change shows in the links at once", async ({ page, request }) => {
		test.skip(!process.env.COOKIE, "needs COOKIE to edit content");
		const headers = { ...api, Cookie: `astro-session=${process.env.COOKIE}` };
		await changeTitle(request, headers, "Brand New Title");
		await page.goto(`${BASE_URL}/posts/${SLUG}`);
		expect(await xHref(page)).toContain("text=Brand+New+Title");
	});
});

async function changeTitle(
	request: APIRequestContext,
	headers: Record<string, string>,
	title: string,
) {
	const list = await request.get(`${BASE_URL}/_emdash/api/content/posts?limit=100`, { headers });
	const items = (await list.json()).data.items as Array<{ id: string; slug: string }>;
	const id = items.find((i) => i.slug === SLUG)?.id;
	if (!id) throw new Error(`seed post ${SLUG} missing`);
	const put = await request.put(`${BASE_URL}/_emdash/api/content/posts/${id}`, {
		headers,
		data: { data: { title, content: textBlock("hi") } },
	});
	expect(put.ok()).toBeTruthy();
	const pub = await request.post(`${BASE_URL}/_emdash/api/content/posts/${id}/publish`, {
		headers,
		data: {},
	});
	expect(pub.ok()).toBeTruthy();
}
