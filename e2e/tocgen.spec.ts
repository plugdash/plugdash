import { test, expect } from "@playwright/test";

// Functional tests for @plugdash/tocgen
// Requires testbed running on localhost:4321 with the tocgen plugin registered.
// Run: pnpm playwright test e2e/tocgen.spec.ts

const BASE_URL = "http://localhost:4321";

test.describe("TableOfContents component rendering", () => {
	test("TOC nav renders when post has 3+ headings", async ({ page }) => {
		await page.goto(`${BASE_URL}/tocgen-test`);
		const nav = page.locator(".plugdash-toc");
		await expect(nav).toBeVisible();
		await expect(nav).toHaveAttribute("aria-label", "Table of contents");
	});

	test("TOC contains correct heading links", async ({ page }) => {
		await page.goto(`${BASE_URL}/tocgen-test`);
		const links = page.locator(".plugdash-toc a");
		// Should have at least 3 heading links
		const count = await links.count();
		expect(count).toBeGreaterThanOrEqual(3);
	});

	test("TOC links have correct href anchors", async ({ page }) => {
		await page.goto(`${BASE_URL}/tocgen-test`);
		const firstLink = page.locator(".plugdash-toc a").first();
		const href = await firstLink.getAttribute("href");
		expect(href).toMatch(/^#[a-z0-9-]+$/);
	});

	test("TOC renders nested structure for h3 children", async ({ page }) => {
		await page.goto(`${BASE_URL}/tocgen-test`);
		// Nested ul inside the top-level ul
		const nestedLists = page.locator(".plugdash-toc ul ul");
		const count = await nestedLists.count();
		expect(count).toBeGreaterThanOrEqual(1);
	});

	test("TOC does not render when post has fewer than minHeadings", async ({ page }) => {
		await page.goto(`${BASE_URL}/tocgen-test-empty`);
		const nav = page.locator(".plugdash-toc");
		await expect(nav).toHaveCount(0);
	});

	test("sticky variant applies sticky positioning", async ({ page }) => {
		await page.goto(`${BASE_URL}/tocgen-test-sticky`);
		const nav = page.locator(".plugdash-toc--sticky");
		await expect(nav).toBeVisible();
		const position = await nav.evaluate((el) => {
			return getComputedStyle(el).position;
		});
		expect(position).toBe("sticky");
	});
});

test.describe("TableOfContents anchor navigation", () => {
	test("clicking a TOC link scrolls to the heading", async ({ page }) => {
		await page.goto(`${BASE_URL}/tocgen-test`);
		const firstLink = page.locator(".plugdash-toc a").first();
		const href = await firstLink.getAttribute("href");
		await firstLink.click();
		// URL hash should match the link href
		const url = page.url();
		expect(url).toContain(href);
	});

	test("TOC links point to existing heading anchors on the page", async ({ page }) => {
		await page.goto(`${BASE_URL}/tocgen-test`);
		const links = page.locator(".plugdash-toc a");
		const count = await links.count();

		for (let i = 0; i < count; i++) {
			const href = await links.nth(i).getAttribute("href");
			if (!href) continue;
			const targetId = href.replace("#", "");
			const target = page.locator(`[id="${targetId}"]`);
			await expect(target).toHaveCount(1);
		}
	});
});
