import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const pkgRoot = resolve(import.meta.dirname, "..");
const srcRoot = resolve(pkgRoot, "src");

describe("@plugdash/engage package structure", () => {
	it("exports EngagementBar.astro from src/", () => {
		const pkg = JSON.parse(
			readFileSync(resolve(pkgRoot, "package.json"), "utf-8"),
		);
		expect(pkg.exports["./EngagementBar.astro"]).toBe(
			"./src/EngagementBar.astro",
		);
	});

	it("depends on heartpost, sharepost, and shortlink", () => {
		const pkg = JSON.parse(
			readFileSync(resolve(pkgRoot, "package.json"), "utf-8"),
		);
		expect(pkg.dependencies["@plugdash/heartpost"]).toBeDefined();
		expect(pkg.dependencies["@plugdash/sharepost"]).toBeDefined();
		expect(pkg.dependencies["@plugdash/shortlink"]).toBeDefined();
	});

	it("has no main or sandbox entry", () => {
		const pkg = JSON.parse(
			readFileSync(resolve(pkgRoot, "package.json"), "utf-8"),
		);
		expect(pkg.main).toBeUndefined();
		expect(pkg.exports["."]).toBeUndefined();
		expect(pkg.exports["./sandbox"]).toBeUndefined();
	});
});

describe("EngagementBar.astro component file", () => {
	it("exists at src/EngagementBar.astro", () => {
		const content = readFileSync(
			resolve(srcRoot, "EngagementBar.astro"),
			"utf-8",
		);
		expect(content).toBeTruthy();
	});

	it("imports HeartButton from @plugdash/heartpost", () => {
		const content = readFileSync(
			resolve(srcRoot, "EngagementBar.astro"),
			"utf-8",
		);
		expect(content).toContain(
			'import HeartButton from "@plugdash/heartpost/HeartButton.astro"',
		);
	});

	it("imports ShareButtons from @plugdash/sharepost", () => {
		const content = readFileSync(
			resolve(srcRoot, "EngagementBar.astro"),
			"utf-8",
		);
		expect(content).toContain(
			'import ShareButtons from "@plugdash/sharepost/ShareButtons.astro"',
		);
	});

	it("imports CopyLink from @plugdash/shortlink", () => {
		const content = readFileSync(
			resolve(srcRoot, "EngagementBar.astro"),
			"utf-8",
		);
		expect(content).toContain(
			'import CopyLink from "@plugdash/shortlink/CopyLink.astro"',
		);
	});

	it("declares post as a required prop", () => {
		const content = readFileSync(
			resolve(srcRoot, "EngagementBar.astro"),
			"utf-8",
		);
		expect(content).toMatch(/post:\s*Record<string,\s*unknown>/);
	});

	it("declares variant prop with circle | pill | ghost", () => {
		const content = readFileSync(
			resolve(srcRoot, "EngagementBar.astro"),
			"utf-8",
		);
		expect(content).toMatch(/variant\?.*"circle"\s*\|\s*"pill"\s*\|\s*"ghost"/);
	});

	it("declares size prop with sm | md | lg", () => {
		const content = readFileSync(
			resolve(srcRoot, "EngagementBar.astro"),
			"utf-8",
		);
		expect(content).toMatch(/size\?.*"sm"\s*\|\s*"md"\s*\|\s*"lg"/);
	});

	it("declares theme prop with auto | dark | light", () => {
		const content = readFileSync(
			resolve(srcRoot, "EngagementBar.astro"),
			"utf-8",
		);
		expect(content).toMatch(/theme\?.*"auto"\s*\|\s*"dark"\s*\|\s*"light"/);
	});

	it("declares showHeart, showShare, showCopy boolean props", () => {
		const content = readFileSync(
			resolve(srcRoot, "EngagementBar.astro"),
			"utf-8",
		);
		expect(content).toMatch(/showHeart\?:\s*boolean/);
		expect(content).toMatch(/showShare\?:\s*boolean/);
		expect(content).toMatch(/showCopy\?:\s*boolean/);
	});

	it("declares attribution boolean prop", () => {
		const content = readFileSync(
			resolve(srcRoot, "EngagementBar.astro"),
			"utf-8",
		);
		expect(content).toMatch(/attribution\?:\s*boolean/);
	});

	it("declares platforms prop", () => {
		const content = readFileSync(
			resolve(srcRoot, "EngagementBar.astro"),
			"utf-8",
		);
		expect(content).toMatch(/platforms\?/);
	});

	it("declares class prop", () => {
		const content = readFileSync(
			resolve(srcRoot, "EngagementBar.astro"),
			"utf-8",
		);
		expect(content).toMatch(/class\?:\s*string/);
	});

	it("defaults variant to circle", () => {
		const content = readFileSync(
			resolve(srcRoot, "EngagementBar.astro"),
			"utf-8",
		);
		expect(content).toMatch(/variant\s*=\s*"circle"/);
	});

	it("defaults size to md", () => {
		const content = readFileSync(
			resolve(srcRoot, "EngagementBar.astro"),
			"utf-8",
		);
		expect(content).toMatch(/size\s*=\s*"md"/);
	});

	it("defaults theme to auto", () => {
		const content = readFileSync(
			resolve(srcRoot, "EngagementBar.astro"),
			"utf-8",
		);
		expect(content).toMatch(/theme\s*=\s*"auto"/);
	});

	it("defaults showHeart, showShare, showCopy to true", () => {
		const content = readFileSync(
			resolve(srcRoot, "EngagementBar.astro"),
			"utf-8",
		);
		expect(content).toMatch(/showHeart\s*=\s*true/);
		expect(content).toMatch(/showShare\s*=\s*true/);
		expect(content).toMatch(/showCopy\s*=\s*true/);
	});

	it("defaults attribution to false", () => {
		const content = readFileSync(
			resolve(srcRoot, "EngagementBar.astro"),
			"utf-8",
		);
		expect(content).toMatch(/attribution\s*=\s*false/);
	});

	it("defaults platforms to twitter, linkedin, bluesky", () => {
		const content = readFileSync(
			resolve(srcRoot, "EngagementBar.astro"),
			"utf-8",
		);
		expect(content).toMatch(
			/platforms\s*=\s*\["twitter",\s*"linkedin",\s*"bluesky"\]/,
		);
	});

	it("uses plugdash-engage-bar CSS class on the container", () => {
		const content = readFileSync(
			resolve(srcRoot, "EngagementBar.astro"),
			"utf-8",
		);
		expect(content).toContain("plugdash-engage-bar");
	});

	it("uses --plugdash-engage-gap custom property", () => {
		const content = readFileSync(
			resolve(srcRoot, "EngagementBar.astro"),
			"utf-8",
		);
		expect(content).toContain("--plugdash-engage-gap");
	});

	it("conditionally renders HeartButton based on showHeart", () => {
		const content = readFileSync(
			resolve(srcRoot, "EngagementBar.astro"),
			"utf-8",
		);
		expect(content).toMatch(/showHeart\s*&&.*HeartButton/s);
	});

	it("conditionally renders ShareButtons based on showShare", () => {
		const content = readFileSync(
			resolve(srcRoot, "EngagementBar.astro"),
			"utf-8",
		);
		expect(content).toMatch(/showShare\s*&&.*ShareButtons/s);
	});

	it("conditionally renders CopyLink based on showCopy", () => {
		const content = readFileSync(
			resolve(srcRoot, "EngagementBar.astro"),
			"utf-8",
		);
		expect(content).toMatch(/showCopy\s*&&.*CopyLink/s);
	});

	it("sets data-theme attribute on the container", () => {
		const content = readFileSync(
			resolve(srcRoot, "EngagementBar.astro"),
			"utf-8",
		);
		expect(content).toContain("data-theme={theme}");
	});
});
