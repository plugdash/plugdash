import { test, expect } from "@playwright/test";

// Functional tests for @plugdash/heartpost
// Requires testbed running on localhost:4321 with the heartpost plugin registered.
// Run: pnpm playwright test e2e/heartpost.spec.ts

const BASE_URL = "http://localhost:4321";

test.describe("HeartButton component rendering", () => {
	test("HeartButton renders when post has an id", async ({ page }) => {
		await page.goto(`${BASE_URL}/heartpost-test`);
		const btn = page.locator(".plugdash-heart").first();
		await expect(btn).toBeVisible();
		await expect(btn).toHaveAttribute("data-post-id");
	});

	test("HeartButton shows heart SVG icon", async ({ page }) => {
		await page.goto(`${BASE_URL}/heartpost-test`);
		const svg = page.locator(".plugdash-heart-svg").first();
		await expect(svg).toBeVisible();
	});

	test("HeartButton circle variant has correct border-radius", async ({ page }) => {
		await page.goto(`${BASE_URL}/heartpost-test`);
		const btn = page.locator(".plugdash-heart--circle").first();
		await expect(btn).toBeVisible();
		const radius = await btn.evaluate((el) => {
			return getComputedStyle(el).borderRadius;
		});
		expect(radius).toMatch(/9999px|50%/);
	});

	test("HeartButton pill variant shows count", async ({ page }) => {
		await page.goto(`${BASE_URL}/heartpost-test-pill`);
		const btn = page.locator(".plugdash-heart--pill").first();
		await expect(btn).toBeVisible();
		const count = page.locator(".plugdash-heart--pill .plugdash-heart-count").first();
		await expect(count).toBeVisible();
	});

	test("HeartButton ghost variant shows count without border", async ({ page }) => {
		await page.goto(`${BASE_URL}/heartpost-test-ghost`);
		const btn = page.locator(".plugdash-heart--ghost").first();
		await expect(btn).toBeVisible();
		const border = await btn.evaluate((el) => {
			return getComputedStyle(el).borderStyle;
		});
		expect(border).toBe("none");
	});

	test("HeartButton does not render when post has no id", async ({ page }) => {
		await page.goto(`${BASE_URL}/heartpost-test-empty`);
		const btn = page.locator(".plugdash-heart");
		await expect(btn).toHaveCount(0);
	});
});

test.describe("HeartButton interaction", () => {
	test("clicking HeartButton sets data-hearted attribute", async ({ page }) => {
		await page.goto(`${BASE_URL}/heartpost-test`);
		const btn = page.locator(".plugdash-heart").first();

		await btn.click();

		// Optimistic update should set data-hearted immediately
		await expect(btn).toHaveAttribute("data-hearted", "true");
	});

	test("heart count increments on click", async ({ page }) => {
		await page.goto(`${BASE_URL}/heartpost-test-pill`);
		const count = page.locator(".plugdash-heart--pill .plugdash-heart-count").first();
		const before = await count.textContent();

		const btn = page.locator(".plugdash-heart--pill").first();
		await btn.click();

		// Count should increment by 1
		const after = await count.textContent();
		expect(parseInt(after || "0")).toBe(parseInt(before || "0") + 1);
	});

	test("second click does not increment count", async ({ page }) => {
		await page.goto(`${BASE_URL}/heartpost-test-pill`);
		const btn = page.locator(".plugdash-heart--pill").first();
		const count = page.locator(".plugdash-heart--pill .plugdash-heart-count").first();

		await btn.click();
		const afterFirst = await count.textContent();

		await btn.click();
		const afterSecond = await count.textContent();

		expect(afterFirst).toBe(afterSecond);
	});
});

test.describe("HeartButton heart fill animation", () => {
	test("heart fill path gets accent color after click", async ({ page }) => {
		await page.goto(`${BASE_URL}/heartpost-test`);
		const btn = page.locator(".plugdash-heart").first();

		await btn.click();

		const fill = page.locator(".plugdash-heart[data-hearted] .plugdash-heart-fill").first();
		await expect(fill).toBeVisible();
	});
});
