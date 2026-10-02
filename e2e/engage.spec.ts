import { expect, test } from "@playwright/test";

// Functional tests for @plugdash/engage.
// Needs a dev site with heartpostPlugin() and shortlinkPlugin() registered and a
// page at /engage-test/[slug] that loads the post with getEmDashEntry and renders
//   <div style="height: 3000px"></div>
//   <EngagementBar post={post} via="plughandle" />
// The spacer keeps the bar below the first viewport.
// Run: BASE_URL=http://127.0.0.1:5122 pnpm playwright test e2e/engage.spec.ts
// Auth uses the dev-bypass endpoint, so point it at `astro dev`, not a prod build.

const BASE_URL = process.env.BASE_URL ?? "http://127.0.0.1:4321";
const H = { "X-EmDash-Request": "1" };

test.describe("engage", () => {
	let slug: string;
	let id: string;

	test.beforeAll(async ({ request }) => {
		await request.get(`${BASE_URL}/_emdash/api/setup/dev-bypass`);
		slug = `engage-e2e-${Date.now()}`;
		const created = await request.post(`${BASE_URL}/_emdash/api/content/posts`, {
			headers: H,
			data: { data: { title: "Engage e2e" }, slug },
		});
		expect(created.ok()).toBe(true);
		id = (await created.json()).data.item.id;
		const pub = await request.post(`${BASE_URL}/_emdash/api/content/posts/${id}/publish`, {
			headers: H,
			data: {},
		});
		expect(pub.ok()).toBe(true);
	});

	test("one bar with heart, share and copy; X link is absolute and carries via", async ({
		page,
	}) => {
		await page.goto(`${BASE_URL}/engage-test/${slug}`);
		await expect(page.locator(".plugdash-engage-bar")).toHaveCount(1);
		const bar = page.locator(".plugdash-engage-bar");
		await expect(bar.locator(".plugdash-heart")).toHaveCount(1);
		await expect(bar.locator(".plugdash-copy")).toHaveCount(1);

		const href = (await bar
			.locator('a[href*="twitter.com"], a[href*="x.com"]')
			.first()
			.getAttribute("href"))!;
		const x = new URL(href);
		expect(x.searchParams.get("via")).toBe("plughandle");
		expect(x.searchParams.get("text")).toBe("Engage e2e");
		expect(x.searchParams.get("url")).toBe(`${new URL(page.url()).origin}/engage-test/${slug}`);
	});

	test("copy button holds an absolute /s/<code> URL that redirects to the post", async ({
		page,
		request,
	}) => {
		await page.goto(`${BASE_URL}/engage-test/${slug}`);
		const copy = (await page.locator(".plugdash-copy").first().getAttribute("data-copy"))!;
		expect(copy).toBe(`${new URL(page.url()).origin}/s/${id.slice(-8).toLowerCase()}`);
		const head = await request.head(copy, { maxRedirects: 0 });
		expect(head.status()).toBe(301);
		expect(head.headers().location).toBe(`/posts/${slug}`);
	});

	test("no heart request before scroll, then the heart works", async ({ page }) => {
		const calls: string[] = [];
		page.on("request", (r) => {
			if (r.url().includes("/api/plugins/heartpost/")) {
				calls.push(`${r.method()} ${r.url().split("heartpost/")[1]!.split("?")[0]}`);
			}
		});
		await page.goto(`${BASE_URL}/engage-test/${slug}`);
		await page.waitForTimeout(500);
		expect(calls).toHaveLength(0);

		const count = page.locator(".plugdash-heart-count");
		await page.locator(".plugdash-heart").scrollIntoViewIfNeeded();
		await expect.poll(() => calls.filter((c) => c === "GET heart-status").length).toBe(1);
		const before = Number(await count.textContent());

		await page.locator(".plugdash-heart").click();
		await expect(count).toHaveText(String(before + 1));
		await page.reload();
		await page.locator(".plugdash-heart").scrollIntoViewIfNeeded();
		await expect(count).toHaveText(String(before + 1));
	});
});
