import { describe, it, expect } from "vitest";
import { getBodyBlocks, getReadingTime } from "../src/reading-time.ts";
import { readtimePlugin, createPlugin } from "../src/index.ts";

const para = (text: string) => ({
	_type: "block",
	_key: "k",
	style: "normal",
	children: [{ _type: "span", _key: "s", text, marks: [] }],
});
const words = (n: number) => Array.from({ length: n }, () => "word").join(" ");
const post = (data: Record<string, unknown>) => ({ id: "slug", data });

describe("getReadingTime", () => {
	it("counts plain words and rounds up", () => {
		expect(getReadingTime(post({ content: [para(words(1200))] }))).toEqual({
			wordCount: 1200,
			minutes: 6,
		});
	});

	it("honours wordsPerMinute", () => {
		expect(getReadingTime(post({ content: [para(words(1200))] }), { wordsPerMinute: 100 }).minutes).toBe(
			12,
		);
	});

	it("never returns less than 1 minute, even with no body", () => {
		expect(getReadingTime(post({}))).toEqual({ wordCount: 0, minutes: 1 });
		expect(getReadingTime(null).minutes).toBe(1);
	});

	it("counts CJK characters at cjkCharsPerMinute", () => {
		// 1000 han chars = 2 min, no words
		expect(getReadingTime([para("漢".repeat(1000))])).toEqual({ wordCount: 1000, minutes: 2 });
		// mixed: 238 words (1 min) + 500 chars (1 min) = 2
		expect(getReadingTime([para(`${words(238)} ${"字".repeat(500)}`)]).minutes).toBe(2);
		// Hangul, Hiragana, Katakana are CJK too
		expect(getReadingTime([para("한ひカ")]).wordCount).toBe(3);
	});

	it("counts Devanagari as space-separated words", () => {
		expect(getReadingTime([para("नमस्ते दुनिया यह एक परीक्षण है")]).wordCount).toBe(6);
	});

	it("counts callout title and body, ignores code and images", () => {
		const blocks = [
			{ _type: "callout", title: "Heads up", body: "read this now" },
			{ _type: "code", code: words(5000) },
			{ _type: "image", asset: { _ref: "x" } },
		];
		expect(getReadingTime(blocks).wordCount).toBe(5);
	});

	it("ignores non-span children", () => {
		const b = { _type: "block", children: [{ _type: "span", text: "a b" }, { _type: "inlineThing" }] };
		expect(getReadingTime([b]).wordCount).toBe(2);
	});
});

describe("getBodyBlocks", () => {
	const a = [para("alpha")];
	const b = [para("beta")];
	const c = [para("gamma")];

	it("prefers content, then body", () => {
		expect(getBodyBlocks(post({ content: a, body: b }))).toBe(a);
		expect(getBodyBlocks(post({ body: b }))).toBe(b);
	});

	it("falls back to the first Portable Text array", () => {
		expect(getBodyBlocks(post({ title: "t", tags: ["x"], story: c }))).toBe(c);
	});

	it("uses the explicit field only", () => {
		expect(getBodyBlocks(post({ content: a, notes: b }), "notes")).toBe(b);
		expect(getBodyBlocks(post({ content: a }), "notes")).toBeNull();
	});

	it("returns null without data", () => {
		expect(getBodyBlocks({ id: "x" })).toBeNull();
		expect(getBodyBlocks(undefined)).toBeNull();
	});
});

describe("readtimePlugin (deprecated no-op)", () => {
	it("is a native descriptor with no capabilities", () => {
		const d = readtimePlugin({ wordsPerMinute: 200, collections: ["posts"] });
		expect(d).toMatchObject({ id: "readtime", format: "native", capabilities: [] });
		expect(d.options).toBeUndefined();
	});

	it("createPlugin has empty hooks", () => {
		const p = createPlugin();
		expect(p.id).toBe("readtime");
		expect(p.hooks).toEqual({});
	});
});
