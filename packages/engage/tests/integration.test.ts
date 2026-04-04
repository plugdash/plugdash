import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

// Integration tests for @plugdash/engage.
// Since engage is a component-only convenience package (no plugin logic,
// no hooks, no sandbox-entry), these tests verify the full wiring between
// engage and its three sub-plugin dependencies.

const pkgRoot = resolve(import.meta.dirname, "..");
const component = readFileSync(
	resolve(pkgRoot, "src/EngagementBar.astro"),
	"utf-8",
);

describe("engage dependency wiring", () => {
	it("heartpost package exists in workspace", () => {
		const heartpostPkg = resolve(
			pkgRoot,
			"../heartpost/src/HeartButton.astro",
		);
		expect(existsSync(heartpostPkg)).toBe(true);
	});

	it("sharepost package exists in workspace", () => {
		const sharepostPkg = resolve(
			pkgRoot,
			"../sharepost/src/ShareButtons.astro",
		);
		expect(existsSync(sharepostPkg)).toBe(true);
	});

	it("shortlink package exists in workspace", () => {
		const shortlinkPkg = resolve(
			pkgRoot,
			"../shortlink/src/CopyLink.astro",
		);
		expect(existsSync(shortlinkPkg)).toBe(true);
	});
});

describe("engage component forwards all required props to children", () => {
	it("passes post to HeartButton", () => {
		expect(component).toMatch(/HeartButton\s[^>]*\{post\}/s);
	});

	it("passes post to ShareButtons", () => {
		expect(component).toMatch(/ShareButtons\s[^>]*\{post\}/s);
	});

	it("passes post to CopyLink", () => {
		expect(component).toMatch(/CopyLink\s[^>]*\{post\}/s);
	});

	it("passes variant to all three children", () => {
		expect(component).toMatch(/HeartButton\s[^>]*\{variant\}/s);
		expect(component).toMatch(/ShareButtons\s[^>]*\{variant\}/s);
		expect(component).toMatch(/CopyLink\s[^>]*\{variant\}/s);
	});

	it("passes size to all three children", () => {
		expect(component).toMatch(/HeartButton\s[^>]*\{size\}/s);
		expect(component).toMatch(/ShareButtons\s[^>]*\{size\}/s);
		expect(component).toMatch(/CopyLink\s[^>]*\{size\}/s);
	});

	it("passes theme to all three children", () => {
		expect(component).toMatch(/HeartButton\s[^>]*\{theme\}/s);
		expect(component).toMatch(/ShareButtons\s[^>]*\{theme\}/s);
		expect(component).toMatch(/CopyLink\s[^>]*\{theme\}/s);
	});

	it("passes platforms only to ShareButtons", () => {
		expect(component).toMatch(/ShareButtons\s[^>]*\{platforms\}/s);
		expect(component).not.toMatch(/HeartButton\s[^>]*\{platforms\}/s);
		expect(component).not.toMatch(/CopyLink\s[^>]*\{platforms\}/s);
	});

	it("passes attribution only to ShareButtons", () => {
		expect(component).toMatch(/ShareButtons\s[^>]*\{attribution\}/s);
		expect(component).not.toMatch(/HeartButton\s[^>]*\{attribution\}/s);
		expect(component).not.toMatch(/CopyLink\s[^>]*\{attribution\}/s);
	});
});

describe("engage variant intersection is correct", () => {
	// engage exposes circle | pill | ghost - the intersection of all three
	// child components. ShareButtons also supports "filled" but HeartButton
	// and CopyLink do not, so engage must not expose it.

	it("does not accept filled variant in the Props interface", () => {
		// Extract the variant type from the Props interface
		const variantMatch = component.match(
			/variant\?:\s*("circle"\s*\|\s*"pill"\s*\|\s*"ghost"[^"\n]*)/,
		);
		expect(variantMatch).not.toBeNull();
		expect(variantMatch![1]).not.toContain("filled");
	});
});

describe("engage package has no plugin artifacts", () => {
	it("has no src/index.ts descriptor file", () => {
		expect(existsSync(resolve(pkgRoot, "src/index.ts"))).toBe(false);
	});

	it("has no src/sandbox-entry.ts file", () => {
		expect(existsSync(resolve(pkgRoot, "src/sandbox-entry.ts"))).toBe(false);
	});

	it("has no dist/ directory", () => {
		expect(existsSync(resolve(pkgRoot, "dist"))).toBe(false);
	});

	it("has no build script in package.json", () => {
		const pkg = JSON.parse(
			readFileSync(resolve(pkgRoot, "package.json"), "utf-8"),
		);
		expect(pkg.scripts?.build).toBeUndefined();
	});
});
