import { describe, it, expect, vi, beforeEach } from "vitest";
import { extractText, calculateReadingTime } from "../src/sandbox-entry.ts";
import { makeContext, makeContentItem } from "@plugdash/testing";
import type { PortableTextBlock } from "@portabletext/types";

// ── extractText ──

describe("extractText", () => {
	it("returns empty string for empty array", () => {
		expect(extractText([])).toBe("");
	});

	it("extracts text from single block with single span", () => {
		const blocks: PortableTextBlock[] = [
			{
				_type: "block",
				_key: "a",
				children: [{ _type: "span", _key: "s1", text: "Hello world", marks: [] }],
				markDefs: [],
				style: "normal",
			},
		];
		expect(extractText(blocks)).toBe("Hello world");
	});

	it("extracts text from multiple blocks", () => {
		const blocks: PortableTextBlock[] = [
			{
				_type: "block",
				_key: "a",
				children: [{ _type: "span", _key: "s1", text: "First", marks: [] }],
				markDefs: [],
				style: "normal",
			},
			{
				_type: "block",
				_key: "b",
				children: [{ _type: "span", _key: "s2", text: "Second", marks: [] }],
				markDefs: [],
				style: "normal",
			},
		];
		expect(extractText(blocks)).toBe("First Second");
	});

	it("ignores non-block types - images, embeds", () => {
		const blocks = [
			{
				_type: "image",
				_key: "img1",
				asset: { _ref: "image-abc" },
			},
			{
				_type: "block",
				_key: "a",
				children: [{ _type: "span", _key: "s1", text: "Text here", marks: [] }],
				markDefs: [],
				style: "normal",
			},
			{
				_type: "embed",
				_key: "e1",
				url: "https://example.com",
			},
		] as unknown as PortableTextBlock[];
		expect(extractText(blocks)).toBe("Text here");
	});

	it("ignores non-span children", () => {
		const blocks: PortableTextBlock[] = [
			{
				_type: "block",
				_key: "a",
				children: [
					{ _type: "span", _key: "s1", text: "Keep this", marks: [] },
					{ _type: "inlineImage", _key: "i1" } as any,
					{ _type: "span", _key: "s2", text: "and this", marks: [] },
				],
				markDefs: [],
				style: "normal",
			},
		];
		expect(extractText(blocks)).toBe("Keep this and this");
	});

	it("handles missing children array", () => {
		const blocks = [
			{
				_type: "block",
				_key: "a",
				markDefs: [],
				style: "normal",
				// no children property
			},
		] as unknown as PortableTextBlock[];
		expect(extractText(blocks)).toBe("");
	});
});

// ── calculateReadingTime ──

describe("calculateReadingTime", () => {
	it("returns wordCount 0 and minutes 1 for empty string", () => {
		const result = calculateReadingTime("", 238);
		expect(result.wordCount).toBe(0);
		expect(result.minutes).toBe(1);
	});

	it("returns correct wordCount for simple sentence", () => {
		const result = calculateReadingTime("The quick brown fox jumps", 238);
		expect(result.wordCount).toBe(5);
	});

	it("applies 238 wpm by default", () => {
		// 238 words should take exactly 1 minute (ceil(238/238) = 1)
		const words = Array.from({ length: 238 }, (_, i) => `word${i}`).join(" ");
		const result = calculateReadingTime(words, 238);
		expect(result.wordCount).toBe(238);
		expect(result.minutes).toBe(1);
	});

	it("respects custom wordsPerMinute config", () => {
		// 100 words at 50 wpm = 2 minutes
		const words = Array.from({ length: 100 }, (_, i) => `word${i}`).join(" ");
		const result = calculateReadingTime(words, 50);
		expect(result.wordCount).toBe(100);
		expect(result.minutes).toBe(2);
	});

	it("enforces minimum 1 minute", () => {
		const result = calculateReadingTime("one", 238);
		expect(result.wordCount).toBe(1);
		expect(result.minutes).toBe(1);
	});

	it("handles 50000 word document correctly", () => {
		const words = Array.from({ length: 50000 }, (_, i) => `word${i}`).join(" ");
		const result = calculateReadingTime(words, 238);
		expect(result.wordCount).toBe(50000);
		// ceil(50000 / 238) = ceil(210.08) = 211
		expect(result.minutes).toBe(211);
	});
});

// ── readtime hook: content:afterSave ──

describe("readtime hook: content:afterSave", () => {
	let ctx: ReturnType<typeof makeContext>;

	beforeEach(() => {
		ctx = makeContext();
	});

	async function runHook(
		content: Record<string, unknown>,
		collection = "posts",
	) {
		// Import the plugin definition and invoke the content:afterSave handler
		const plugin = await import("../src/sandbox-entry.ts");
		const hook = plugin.default.hooks["content:afterSave"];
		const event = { content, collection, isNew: false };
		await hook.handler(event, ctx);
	}

	it("writes wordCount and readingTimeMinutes on published post", async () => {
		const content = makeContentItem({
			status: "published",
			data: {
				body: [
					{
						_type: "block",
						_key: "a",
						children: [{ _type: "span", _key: "s1", text: "one two three four five", marks: [] }],
						markDefs: [],
						style: "normal",
					},
				],
				metadata: {},
			},
		});

		// Mock content.get to return existing content for merge
		ctx.content!.get = vi.fn().mockResolvedValue({
			id: content.id,
			type: "posts",
			slug: content.slug,
			status: "published",
			data: { body: content.data.body, metadata: {} },
			createdAt: content.createdAt,
			updatedAt: content.updatedAt,
		});

		await runHook(content, "posts");

		expect(ctx.content!.update).toHaveBeenCalledWith(
			"posts",
			content.id,
			expect.objectContaining({
				metadata: expect.objectContaining({
					wordCount: 5,
					readingTimeMinutes: 1,
				}),
			}),
		);
	});

	it("skips draft content - ctx.content.update not called", async () => {
		const content = makeContentItem({ status: "draft" });
		await runHook(content);
		expect(ctx.content!.update).not.toHaveBeenCalled();
	});

	it("skips archived content", async () => {
		const content = makeContentItem({ status: "archived" });
		await runHook(content);
		expect(ctx.content!.update).not.toHaveBeenCalled();
	});

	it("skips scheduled content", async () => {
		const content = makeContentItem({ status: "scheduled" });
		await runHook(content);
		expect(ctx.content!.update).not.toHaveBeenCalled();
	});

	it("skips collections not in config.collections list", async () => {
		// Set config.collections to only allow "articles"
		ctx.kv.get = vi.fn().mockImplementation((key: string) => {
			if (key === "config:collections") return Promise.resolve(["articles"]);
			if (key === "config:wordsPerMinute") return Promise.resolve(238);
			return Promise.resolve(null);
		});

		const content = makeContentItem({ status: "published" });
		await runHook(content, "posts");
		expect(ctx.content!.update).not.toHaveBeenCalled();
	});

	it("processes all collections when config.collections is undefined", async () => {
		// config.collections returns null (default - all collections)
		ctx.kv.get = vi.fn().mockImplementation((key: string) => {
			if (key === "config:collections") return Promise.resolve(null);
			if (key === "config:wordsPerMinute") return Promise.resolve(238);
			return Promise.resolve(null);
		});

		const content = makeContentItem({
			status: "published",
			data: {
				body: [
					{
						_type: "block",
						_key: "a",
						children: [{ _type: "span", _key: "s1", text: "hello", marks: [] }],
						markDefs: [],
						style: "normal",
					},
				],
				metadata: {},
			},
		});

		ctx.content!.get = vi.fn().mockResolvedValue({
			id: content.id,
			type: "any-collection",
			slug: content.slug,
			status: "published",
			data: { body: [], metadata: {} },
			createdAt: content.createdAt,
			updatedAt: content.updatedAt,
		});

		await runHook(content, "any-collection");
		expect(ctx.content!.update).toHaveBeenCalled();
	});

	it("merges with existing metadata, does not overwrite other fields", async () => {
		const content = makeContentItem({
			status: "published",
			data: {
				body: [
					{
						_type: "block",
						_key: "a",
						children: [{ _type: "span", _key: "s1", text: "hello world", marks: [] }],
						markDefs: [],
						style: "normal",
					},
				],
				metadata: { author: "someone", seoTitle: "My Post" },
			},
		});

		ctx.content!.get = vi.fn().mockResolvedValue({
			id: content.id,
			type: "posts",
			slug: content.slug,
			status: "published",
			data: { body: [], metadata: { author: "someone", seoTitle: "My Post" } },
			createdAt: content.createdAt,
			updatedAt: content.updatedAt,
		});

		await runHook(content, "posts");

		const updateCall = (ctx.content!.update as ReturnType<typeof vi.fn>).mock.calls[0];
		const updatedData = updateCall[2];
		expect(updatedData.metadata.author).toBe("someone");
		expect(updatedData.metadata.seoTitle).toBe("My Post");
		expect(updatedData.metadata.wordCount).toBe(2);
		expect(updatedData.metadata.readingTimeMinutes).toBe(1);
	});

	it("handles undefined ctx.content gracefully - logs error, does not throw", async () => {
		// Remove content capability
		const noContentCtx = makeContext({ content: undefined });
		const content = makeContentItem({ status: "published" });

		const plugin = await import("../src/sandbox-entry.ts");
		const hook = plugin.default.hooks["content:afterSave"];
		const event = { content, collection: "posts", isNew: false };

		// Should not throw
		await expect(hook.handler(event, noContentCtx)).resolves.toBeUndefined();
		expect(noContentCtx.log.error).toHaveBeenCalled();
	});

	it("is idempotent - second publish overwrites, does not duplicate", async () => {
		const content = makeContentItem({
			status: "published",
			data: {
				body: [
					{
						_type: "block",
						_key: "a",
						children: [{ _type: "span", _key: "s1", text: "one two three", marks: [] }],
						markDefs: [],
						style: "normal",
					},
				],
				metadata: { wordCount: 99, readingTimeMinutes: 99 },
			},
		});

		ctx.content!.get = vi.fn().mockResolvedValue({
			id: content.id,
			type: "posts",
			slug: content.slug,
			status: "published",
			data: { body: [], metadata: { wordCount: 99, readingTimeMinutes: 99 } },
			createdAt: content.createdAt,
			updatedAt: content.updatedAt,
		});

		await runHook(content, "posts");

		const updateCall = (ctx.content!.update as ReturnType<typeof vi.fn>).mock.calls[0];
		const updatedData = updateCall[2];
		// Should be 3 (fresh calculation), not 99 or 102
		expect(updatedData.metadata.wordCount).toBe(3);
		expect(updatedData.metadata.readingTimeMinutes).toBe(1);
	});
});
