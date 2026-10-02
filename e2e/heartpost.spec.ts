import { test, expect } from "@playwright/test";

// Functional tests for @plugdash/heartpost
// Needs an EmDash site with heartpostPlugin() registered and a published post
// whose page renders two HeartButtons: #hb-top (in the first viewport) and
// #hb-bottom (far below it, past a tall spacer).
// Run: HEART_BASE_URL=http://127.0.0.1:5118 HEART_POST_SLUG=h1 pnpm playwright test e2e/heartpost.spec.ts

const BASE_URL = process.env.HEART_BASE_URL ?? "http://127.0.0.1:5118";
const SLUG = process.env.HEART_POST_SLUG ?? "h1";
const PAGE = `${BASE_URL}/posts/${SLUG}`;

function track(page: import("@playwright/test").Page) {
	const calls: string[] = [];
	page.on("request", (r) => {
		const u = r.url();
		if (u.includes("/api/plugins/heartpost/")) {
			calls.push(`${r.method()} ${u.split("heartpost/")[1]!.split("?")[0]}`);
		}
	});
	return calls;
}

const count = (page: import("@playwright/test").Page, id: string) =>
	page.locator(`${id} .plugdash-heart-count`);

test("count is fetched lazily and once for two buttons", async ({ page }) => {
	const calls = track(page);
	await page.goto(PAGE);
	await page.waitForTimeout(500);
	// the top button is in view, the bottom one is not
	expect(calls.filter((c) => c === "GET heart-status")).toHaveLength(1);
	await page.locator("#hb-bottom").scrollIntoViewIfNeeded();
	await page.waitForTimeout(500);
	expect(calls.filter((c) => c === "GET heart-status")).toHaveLength(1);
});

test("clicking one button updates both and survives a reload", async ({ page }) => {
	await page.goto(PAGE);
	await page.locator("#hb-bottom").scrollIntoViewIfNeeded();
	await expect(count(page, "#hb-bottom")).not.toHaveText("0");
	const before = Number(await count(page, "#hb-bottom").textContent());

	await page.locator("#hb-bottom button").click();
	await expect(count(page, "#hb-top")).toHaveText(String(before + 1));
	await expect(count(page, "#hb-bottom")).toHaveText(String(before + 1));
	await expect(page.locator("#hb-top button")).toHaveAttribute("data-hearted", "true");

	await page.reload();
	await expect(page.locator("#hb-top button")).toHaveAttribute("data-hearted", "true");

	// second click removes the heart
	await page.locator("#hb-top button").click();
	await expect(count(page, "#hb-top")).toHaveText(String(before));
	await expect(page.locator("#hb-top button")).not.toHaveAttribute("data-hearted", "true");
});

test("heart and heart-remove send the entry id, not the slug", async ({ page }) => {
	let body = "";
	page.on("request", (r) => {
		if (r.method() === "POST" && r.url().endsWith("/heartpost/heart")) body = r.postData() ?? "";
	});
	await page.goto(PAGE);
	await page.locator("#hb-top button").click();
	await expect.poll(() => body).not.toBe("");
	expect(JSON.parse(body).id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
});

test("rejects an id that is not a published entry", async ({ request }) => {
	const res = await request.post(`${BASE_URL}/_emdash/api/plugins/heartpost/heart`, {
		data: { id: "not-an-entry" },
	});
	expect(res.ok()).toBe(false);
});
