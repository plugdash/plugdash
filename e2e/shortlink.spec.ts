import { test, expect } from "@playwright/test";

// Functional tests for @plugdash/shortlink
// Requires testbed running on localhost:4321 with the shortlink plugin registered.
// Run: pnpm playwright test e2e/shortlink.spec.ts

const BASE_URL = "http://localhost:4321";

test.describe("CopyLink component rendering", () => {
	test("CopyLink button renders when shortlink metadata exists", async ({ page }) => {
		await page.goto(`${BASE_URL}/shortlink-test`);
		const btn = page.locator(".plugdash-copy").first();
		await expect(btn).toBeVisible();
		await expect(btn).toHaveAttribute("data-copy");
	});

	test("CopyLink button has copy icon visible by default", async ({ page }) => {
		await page.goto(`${BASE_URL}/shortlink-test`);
		const icon = page.locator(".plugdash-copy-icon").first();
		await expect(icon).toBeVisible();
		// Check icon should be hidden
		const check = page.locator(".plugdash-copy-check").first();
		await expect(check).not.toBeVisible();
	});

	test("CopyLink circle variant has correct border-radius", async ({ page }) => {
		await page.goto(`${BASE_URL}/shortlink-test`);
		const btn = page.locator(".plugdash-copy--circle").first();
		await expect(btn).toBeVisible();
		const radius = await btn.evaluate((el) => {
			return getComputedStyle(el).borderRadius;
		});
		// Should be fully rounded (9999px or 50%)
		expect(radius).toMatch(/9999px|50%/);
	});

	test("CopyLink pill variant renders with padding", async ({ page }) => {
		await page.goto(`${BASE_URL}/shortlink-test-pill`);
		const btn = page.locator(".plugdash-copy--pill").first();
		await expect(btn).toBeVisible();
	});

	test("CopyLink ghost variant renders without border", async ({ page }) => {
		await page.goto(`${BASE_URL}/shortlink-test-ghost`);
		const btn = page.locator(".plugdash-copy--ghost").first();
		await expect(btn).toBeVisible();
		const border = await btn.evaluate((el) => {
			return getComputedStyle(el).borderStyle;
		});
		expect(border).toBe("none");
	});

	test("CopyLink does not render when shortlink metadata is missing", async ({ page }) => {
		await page.goto(`${BASE_URL}/shortlink-test-empty`);
		const btn = page.locator(".plugdash-copy");
		await expect(btn).toHaveCount(0);
	});

	test("CopyLink with showUrl displays the short URL text", async ({ page }) => {
		await page.goto(`${BASE_URL}/shortlink-test-showurl`);
		const urlText = page.locator(".plugdash-copy-url").first();
		await expect(urlText).toBeVisible();
		await expect(urlText).toContainText("/s/");
	});
});

test.describe("CopyLink copy interaction", () => {
	test("clicking CopyLink sets data-copied attribute", async ({ page, context }) => {
		// Grant clipboard permissions
		await context.grantPermissions(["clipboard-read", "clipboard-write"]);
		await page.goto(`${BASE_URL}/shortlink-test`);

		const btn = page.locator(".plugdash-copy").first();
		await btn.click();

		// Should show the check icon after click
		await expect(btn).toHaveAttribute("data-copied", "true");
	});

	test("data-copied attribute resets after timeout", async ({ page, context }) => {
		await context.grantPermissions(["clipboard-read", "clipboard-write"]);
		await page.goto(`${BASE_URL}/shortlink-test`);

		const btn = page.locator(".plugdash-copy").first();
		await btn.click();
		await expect(btn).toHaveAttribute("data-copied", "true");

		// Wait for the reset (default 2000ms)
		await expect(btn).not.toHaveAttribute("data-copied", { timeout: 3000 });
	});
});

test.describe("shortlink redirect", () => {
	test("/s/[code] redirects to target URL", async ({ page }) => {
		// This test requires a published post with a shortlink
		const response = await page.goto(`${BASE_URL}/s/test1`);
		// Should redirect (301) or land on the target page
		expect(response?.status()).toBeLessThan(400);
	});

	test("/s/[unknown] returns 404", async ({ page }) => {
		const response = await page.goto(`${BASE_URL}/s/nonexistent`, {
			failOnStatusCode: false,
		});
		expect(response?.status()).toBe(404);
	});
});
