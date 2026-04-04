import { test, expect } from "@playwright/test";

// Functional tests for @plugdash/engage
// Requires testbed running on localhost:4321 with heartpost, sharepost,
// and shortlink plugins registered.
// Run: pnpm playwright test e2e/engage.spec.ts

const BASE_URL = "http://localhost:4321";

test.describe("EngagementBar component rendering", () => {
	test("EngagementBar renders all three children by default", async ({ page }) => {
		await page.goto(`${BASE_URL}/engage-test`);
		const bar = page.locator(".plugdash-engage-bar").first();
		await expect(bar).toBeVisible();

		// HeartButton, ShareButtons, CopyLink all present
		await expect(bar.locator(".plugdash-heart").first()).toBeVisible();
		await expect(bar.locator(".plugdash-share").first()).toBeVisible();
		await expect(bar.locator(".plugdash-copy").first()).toBeVisible();
	});

	test("EngagementBar is a flex row with gap", async ({ page }) => {
		await page.goto(`${BASE_URL}/engage-test`);
		const bar = page.locator(".plugdash-engage-bar").first();
		const display = await bar.evaluate((el) => getComputedStyle(el).display);
		expect(display).toBe("flex");
	});

	test("EngagementBar sets data-theme attribute", async ({ page }) => {
		await page.goto(`${BASE_URL}/engage-test`);
		const bar = page.locator(".plugdash-engage-bar").first();
		await expect(bar).toHaveAttribute("data-theme");
	});
});

test.describe("EngagementBar show/hide props", () => {
	test("showHeart=false hides HeartButton", async ({ page }) => {
		await page.goto(`${BASE_URL}/engage-test-no-heart`);
		const bar = page.locator(".plugdash-engage-bar").first();
		await expect(bar).toBeVisible();
		await expect(bar.locator(".plugdash-heart")).toHaveCount(0);
		await expect(bar.locator(".plugdash-share").first()).toBeVisible();
		await expect(bar.locator(".plugdash-copy").first()).toBeVisible();
	});

	test("showShare=false hides ShareButtons", async ({ page }) => {
		await page.goto(`${BASE_URL}/engage-test-no-share`);
		const bar = page.locator(".plugdash-engage-bar").first();
		await expect(bar).toBeVisible();
		await expect(bar.locator(".plugdash-heart").first()).toBeVisible();
		await expect(bar.locator(".plugdash-share")).toHaveCount(0);
		await expect(bar.locator(".plugdash-copy").first()).toBeVisible();
	});

	test("showCopy=false hides CopyLink", async ({ page }) => {
		await page.goto(`${BASE_URL}/engage-test-no-copy`);
		const bar = page.locator(".plugdash-engage-bar").first();
		await expect(bar).toBeVisible();
		await expect(bar.locator(".plugdash-heart").first()).toBeVisible();
		await expect(bar.locator(".plugdash-share").first()).toBeVisible();
		await expect(bar.locator(".plugdash-copy")).toHaveCount(0);
	});
});

test.describe("EngagementBar variant props", () => {
	test("pill variant applies to all children", async ({ page }) => {
		await page.goto(`${BASE_URL}/engage-test-pill`);
		const bar = page.locator(".plugdash-engage-bar").first();
		await expect(bar.locator(".plugdash-heart--pill").first()).toBeVisible();
		await expect(bar.locator(".plugdash-share--pill").first()).toBeVisible();
		await expect(bar.locator(".plugdash-copy--pill").first()).toBeVisible();
	});

	test("ghost variant applies to all children", async ({ page }) => {
		await page.goto(`${BASE_URL}/engage-test-ghost`);
		const bar = page.locator(".plugdash-engage-bar").first();
		await expect(bar.locator(".plugdash-heart--ghost").first()).toBeVisible();
		await expect(bar.locator(".plugdash-share--ghost").first()).toBeVisible();
		await expect(bar.locator(".plugdash-copy--ghost").first()).toBeVisible();
	});
});

test.describe("EngagementBar size props", () => {
	test("sm size applies to all children", async ({ page }) => {
		await page.goto(`${BASE_URL}/engage-test-sm`);
		const bar = page.locator(".plugdash-engage-bar").first();
		await expect(bar.locator(".plugdash-heart--sm").first()).toBeVisible();
		await expect(bar.locator(".plugdash-share--sm").first()).toBeVisible();
		await expect(bar.locator(".plugdash-copy--sm").first()).toBeVisible();
	});
});
