import { test, expect } from "@playwright/test";

// Functional tests for @plugdash/callout
// Requires testbed running on localhost:4321 with the callout plugin registered.
// Run: pnpm playwright test e2e/callout.spec.ts

const BASE_URL = "http://localhost:4321";

test.describe("callout block rendering", () => {
	test("info callout renders with correct class and content", async ({ page }) => {
		await page.goto(`${BASE_URL}/callout-test`);
		const callout = page.locator(".plugdash-callout--info").first();
		await expect(callout).toBeVisible();
		await expect(callout.locator(".plugdash-callout__body")).toContainText(
			"This is an info callout",
		);
	});

	test("warning callout renders with correct class", async ({ page }) => {
		await page.goto(`${BASE_URL}/callout-test`);
		const callout = page.locator(".plugdash-callout--warning").first();
		await expect(callout).toBeVisible();
	});

	test("tip callout renders with correct class", async ({ page }) => {
		await page.goto(`${BASE_URL}/callout-test`);
		const callout = page.locator(".plugdash-callout--tip").first();
		await expect(callout).toBeVisible();
	});

	test("danger callout renders with correct class", async ({ page }) => {
		await page.goto(`${BASE_URL}/callout-test`);
		const callout = page.locator(".plugdash-callout--danger").first();
		await expect(callout).toBeVisible();
	});

	test("callout with title renders title element", async ({ page }) => {
		await page.goto(`${BASE_URL}/callout-test`);
		const title = page.locator(".plugdash-callout__title").first();
		await expect(title).toBeVisible();
		await expect(title).not.toBeEmpty();
	});

	test("callout without title omits title element", async ({ page }) => {
		await page.goto(`${BASE_URL}/callout-test-no-title`);
		const callout = page.locator(".plugdash-callout").first();
		await expect(callout).toBeVisible();
		await expect(callout.locator(".plugdash-callout__title")).toHaveCount(0);
	});

	test("callout icon is visible by default", async ({ page }) => {
		await page.goto(`${BASE_URL}/callout-test`);
		const icon = page.locator(".plugdash-callout__icon").first();
		await expect(icon).toBeVisible();
		// Icon contains an SVG
		await expect(icon.locator("svg")).toHaveCount(1);
	});

	test("callout with icon disabled has no icon element", async ({ page }) => {
		await page.goto(`${BASE_URL}/callout-test-no-icon`);
		const callout = page.locator(".plugdash-callout").first();
		await expect(callout).toBeVisible();
		await expect(callout.locator(".plugdash-callout__icon")).toHaveCount(0);
	});
});

test.describe("callout CSS custom properties", () => {
	test("accent color can be overridden via custom property", async ({ page }) => {
		await page.goto(`${BASE_URL}/callout-test-custom`);
		const callout = page.locator(".plugdash-callout--info").first();
		await expect(callout).toBeVisible();
		// The test page sets --plugdash-callout-info-accent to a custom value
		const borderColor = await callout.evaluate((el) => {
			return getComputedStyle(el).borderLeftColor;
		});
		// Should not be the default blue (#3b82f6 = rgb(59, 130, 246))
		expect(borderColor).not.toBe("rgb(59, 130, 246)");
	});
});
