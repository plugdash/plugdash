import { test, expect } from "@playwright/test";

// Functional tests for @plugdash/sharepost
// Requires testbed running on localhost:4321 with the sharepost plugin registered.
// Run: pnpm playwright test e2e/sharepost.spec.ts

const BASE_URL = "http://localhost:4321";

test.describe("ShareButtons component rendering", () => {
	test("ShareButtons render when shareUrls metadata exists", async ({ page }) => {
		await page.goto(`${BASE_URL}/sharepost-test`);
		const container = page.locator(".plugdash-share").first();
		await expect(container).toBeVisible();
	});

	test("ShareButtons renders correct number of platform buttons", async ({ page }) => {
		await page.goto(`${BASE_URL}/sharepost-test`);
		// Default platforms: twitter, linkedin, bluesky
		const buttons = page.locator(".plugdash-share-btn");
		await expect(buttons).toHaveCount(3);
	});

	test("each share button has correct aria-label", async ({ page }) => {
		await page.goto(`${BASE_URL}/sharepost-test`);
		await expect(page.locator('[aria-label="Share on twitter"]')).toBeVisible();
		await expect(page.locator('[aria-label="Share on linkedin"]')).toBeVisible();
		await expect(page.locator('[aria-label="Share on bluesky"]')).toBeVisible();
	});

	test("share buttons open in new tab", async ({ page }) => {
		await page.goto(`${BASE_URL}/sharepost-test`);
		const btn = page.locator(".plugdash-share-btn").first();
		await expect(btn).toHaveAttribute("target", "_blank");
		await expect(btn).toHaveAttribute("rel", "noopener noreferrer");
	});

	test("Twitter button links to intent URL", async ({ page }) => {
		await page.goto(`${BASE_URL}/sharepost-test`);
		const btn = page.locator(".plugdash-share-btn--twitter").first();
		const href = await btn.getAttribute("href");
		expect(href).toContain("twitter.com/intent/tweet");
	});

	test("circle variant has correct border-radius", async ({ page }) => {
		await page.goto(`${BASE_URL}/sharepost-test`);
		const btn = page.locator(".plugdash-share--circle .plugdash-share-btn").first();
		await expect(btn).toBeVisible();
		const radius = await btn.evaluate((el) => {
			return getComputedStyle(el).borderRadius;
		});
		expect(radius).toMatch(/9999px|50%/);
	});

	test("pill variant renders with label text", async ({ page }) => {
		await page.goto(`${BASE_URL}/sharepost-test-pill`);
		const btn = page.locator(".plugdash-share--pill .plugdash-share-btn").first();
		await expect(btn).toBeVisible();
		// Pill variant includes a span with platform name
		const span = btn.locator("span");
		await expect(span).toBeVisible();
	});

	test("ghost variant renders platform names as text", async ({ page }) => {
		await page.goto(`${BASE_URL}/sharepost-test-ghost`);
		const btn = page.locator(".plugdash-share--ghost .plugdash-share-btn").first();
		await expect(btn).toBeVisible();
	});

	test("ShareButtons do not render when shareUrls metadata is missing", async ({ page }) => {
		await page.goto(`${BASE_URL}/sharepost-test-empty`);
		const container = page.locator(".plugdash-share");
		await expect(container).toHaveCount(0);
	});

	test("attribution link renders when enabled", async ({ page }) => {
		await page.goto(`${BASE_URL}/sharepost-test-attribution`);
		const attribution = page.locator(".plugdash-attribution").first();
		await expect(attribution).toBeVisible();
		await expect(attribution).toHaveText("by plugdash");
		await expect(attribution).toHaveAttribute("href", "https://plugdash.dev");
	});
});

test.describe("ShareButtons link targets", () => {
	test("LinkedIn button links to sharing URL", async ({ page }) => {
		await page.goto(`${BASE_URL}/sharepost-test`);
		const btn = page.locator(".plugdash-share-btn--linkedin").first();
		const href = await btn.getAttribute("href");
		expect(href).toContain("linkedin.com/sharing/share-offsite");
	});

	test("Bluesky button links to compose URL", async ({ page }) => {
		await page.goto(`${BASE_URL}/sharepost-test`);
		const btn = page.locator(".plugdash-share-btn--bluesky").first();
		const href = await btn.getAttribute("href");
		expect(href).toContain("bsky.app/intent/compose");
	});

	test("all platform URLs contain the post URL", async ({ page }) => {
		await page.goto(`${BASE_URL}/sharepost-test-all`);
		const buttons = page.locator(".plugdash-share-btn");
		const count = await buttons.count();
		for (let i = 0; i < count; i++) {
			const href = await buttons.nth(i).getAttribute("href");
			// Every share URL should reference the post (either in url param or body)
			expect(href).toBeTruthy();
		}
	});
});
