import { describe, expect, it } from "vitest";
import toc from "../src/TableOfContents.astro?raw";
import list from "../src/TocList.astro?raw";

// The root vitest setup cannot import .astro files (no Astro vite plugin), so
// these guard the source. Real rendering of the XSS payload is checked on an
// EmDash site (see the PR description).
const sources = [toc, list];

describe("TableOfContents escaping", () => {
	it("never injects heading text as raw HTML", () => {
		for (const src of sources) {
			expect(src).not.toContain("set:html");
			expect(src).not.toContain("innerHTML");
		}
	});

	it("renders text and id through Astro expressions", () => {
		expect(list).toContain("{e.text}");
		expect(list).toContain("href={`#${e.id}`}");
	});
});
