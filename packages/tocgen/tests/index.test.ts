import { describe, it, expect } from "vitest";
import {
	deduplicateAnchors,
	extractHeadings,
	getBodyBlocks,
	getToc,
	nestHeadings,
	toAnchor,
} from "../src/toc.ts";
import { createPlugin, tocgenPlugin } from "../src/index.ts";
import anchors from "../src/HeadingAnchors.astro?raw";

const block = (style: string, text: string) => ({
	_type: "block",
	_key: text,
	style,
	children: [{ _type: "span", _key: "s", text, marks: [] }],
});
const post = (data: Record<string, unknown>) => ({ id: "slug", data });

describe("toAnchor", () => {
	it("slugs English", () => {
		expect(toAnchor("Getting Started!")).toBe("getting-started");
		expect(toAnchor("  A -- B  ")).toBe("a-b");
	});

	it("keeps Hindi letters and vowel signs", () => {
		expect(toAnchor("हिंदी शीर्षक")).toBe("हिंदी-शीर्षक");
		expect(toAnchor("हिंदी शीर्षक")).not.toBe("");
		expect(toAnchor("हिंदी शीर्षक")).not.toBe(toAnchor("दूसरा शीर्षक"));
	});

	it("strips accents but keeps the letters", () => {
		expect(toAnchor("Émojis & Ünicode")).toBe("emojis-unicode");
	});

	it("falls back to section for emoji-only and punctuation-only text", () => {
		expect(toAnchor("🚀🔥")).toBe("section");
		expect(toAnchor("?!...")).toBe("section");
	});
});

describe("extractHeadings", () => {
	it("returns h2-h4 only, skips empty ones", () => {
		const body = [
			block("h1", "Title"),
			block("h2", "A"),
			block("normal", "text"),
			block("h3", "  "),
			block("h4", "B"),
			{ _type: "image" },
		];
		expect(extractHeadings(body)).toEqual([
			{ level: 2, text: "A" },
			{ level: 4, text: "B" },
		]);
	});
});

describe("deduplicateAnchors", () => {
	it("suffixes repeats as x, x-2, x-3", () => {
		const ids = deduplicateAnchors([2, 2, 3].map((level) => ({ level, text: "Same" }))).map(
			(h) => h.id,
		);
		expect(ids).toEqual(["same", "same-2", "same-3"]);
	});

	it("gives distinct non-empty ids to non-Latin headings", () => {
		const ids = deduplicateAnchors(
			["हिंदी शीर्षक", "दूसरा शीर्षक", "हिंदी शीर्षक", "🚀", "🔥"].map((text) => ({
				level: 2,
				text,
			})),
		).map((h) => h.id);
		expect(ids.every(Boolean)).toBe(true);
		expect(new Set(ids).size).toBe(ids.length);
	});
});

describe("nestHeadings", () => {
	const flat = deduplicateAnchors([
		{ level: 2, text: "A" },
		{ level: 3, text: "A1" },
		{ level: 4, text: "A1a" },
		{ level: 2, text: "B" },
	]);

	it("nests by level", () => {
		const t = nestHeadings(flat, 4);
		expect(t.map((e) => e.text)).toEqual(["A", "B"]);
		expect(t[0]!.children[0]!.children[0]!.text).toBe("A1a");
	});

	it("honours maxDepth", () => {
		expect(nestHeadings(flat, 2).every((e) => e.children.length === 0)).toBe(true);
	});

	it("promotes orphan h3 to the top", () => {
		expect(nestHeadings(deduplicateAnchors([{ level: 3, text: "X" }]), 3)[0]!.text).toBe("X");
	});
});

describe("getBodyBlocks", () => {
	const pt = [block("h2", "A")];
	it("prefers content, then body, then any PT array", () => {
		expect(getBodyBlocks(post({ content: pt, body: [] }))).toBe(pt);
		expect(getBodyBlocks(post({ body: pt }))).toBe(pt);
		expect(getBodyBlocks(post({ title: "x", other: pt }))).toBe(pt);
	});
	it("honours field and returns null when missing", () => {
		expect(getBodyBlocks(post({ content: [block("h2", "Z")], alt: pt }), "alt")).toBe(pt);
		expect(getBodyBlocks(post({ title: "x" }))).toBeNull();
		expect(getBodyBlocks(null)).toBeNull();
	});
});

describe("getToc", () => {
	const headings = [block("h2", "One"), block("h3", "Two"), block("h2", "Three")];

	it("returns a nested TOC for a post", () => {
		const t = getToc(post({ content: headings }));
		expect(t.map((e) => e.id)).toEqual(["one", "three"]);
		expect(t[0]!.children[0]!.id).toBe("two");
	});

	it("is empty below minHeadings", () => {
		expect(getToc(post({ content: headings.slice(0, 2) }))).toEqual([]);
		expect(getToc(post({ content: headings.slice(0, 2) }), { minHeadings: 2 })).toHaveLength(1);
	});

	it("counts only headings within maxDepth toward minHeadings", () => {
		expect(getToc(post({ content: headings }), { maxDepth: 2 })).toEqual([]);
	});

	it("accepts a bare block array and survives bad input", () => {
		expect(getToc(headings)).toHaveLength(2);
		expect(getToc(undefined)).toEqual([]);
		expect(getToc(post({}))).toEqual([]);
	});
});

// Run the inline script from HeadingAnchors.astro against a fake DOM and
// compare the ids with getToc().
function scriptIds(texts: string[], preset: Record<number, string> = {}) {
	const script = /<script[^>]*>([\s\S]*?)<\/script>/.exec(anchors)![1]!;
	const els = texts.map((textContent, i) => ({ textContent, id: preset[i] ?? "" }));
	const doc = { querySelector: () => ({ querySelectorAll: () => els }) };
	new Function("document", "selector", script)(doc, "article");
	return els.map((e) => e.id);
}

describe("HeadingAnchors script", () => {
	const texts = ["हिंदी शीर्षक", "दूसरा शीर्षक", "Émojis & Ünicode", "Same", "Same", "🚀", "Same"];

	it("is under 1 KB", () => {
		const script = /<script[^>]*>([\s\S]*?)<\/script>/.exec(anchors)![1]!;
		expect(script.length).toBeLessThan(1024);
	});

	it("sets the same ids getToc links to", () => {
		const body = texts.map((t) => block("h2", t));
		const flat = (es: ReturnType<typeof getToc>): string[] =>
			es.flatMap((e) => [e.id, ...flat(e.children)]);
		expect(scriptIds(texts)).toEqual(flat(getToc(post({ content: body }))));
	});

	it("leaves existing ids alone", () => {
		expect(scriptIds(["A", "B"], { 0: "mine" })).toEqual(["mine", "b"]);
	});
});

describe("deprecated plugin descriptor", () => {
	it("is a no-op native descriptor", () => {
		const d = tocgenPlugin({ minHeadings: 2 });
		expect(d).toMatchObject({ id: "tocgen", format: "native", capabilities: [] });
		expect(d.entrypoint).toBe("@plugdash/tocgen");
		expect(createPlugin().hooks).toBeDefined();
	});
});
