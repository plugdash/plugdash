import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeContext, makeContentItem } from "@plugdash/testing";
import type { PortableTextBlock } from "@portabletext/types";

// Integration tests for the readtime plugin.
// These test the full plugin lifecycle against a mocked EmDash context.
// A real EmDashTestClient testbed is not available, so we use comprehensive
// mocks that simulate the host's behavior faithfully.

function makeBlocks(text: string): PortableTextBlock[] {
	return [
		{
			_type: "block",
			_key: "b1",
			children: [{ _type: "span", _key: "s1", text, marks: [] }],
			markDefs: [],
			style: "normal",
		},
	];
}

describe("readtime integration", () => {
	let ctx: ReturnType<typeof makeContext>;

	beforeEach(() => {
		ctx = makeContext();
		// Default KV returns: wordsPerMinute=238, collections=null (all)
		ctx.kv.get = vi.fn().mockImplementation((key: string) => {
			if (key === "config:wordsPerMinute") return Promise.resolve(238);
			if (key === "config:collections") return Promise.resolve(null);
			return Promise.resolve(null);
		});
	});

	async function runAfterSave(
		content: Record<string, unknown>,
		collection = "posts",
	) {
		const plugin = await import("../src/sandbox-entry.ts");
		const hook = plugin.default.hooks!["content:afterSave"];
		await hook.handler({ content, collection, isNew: false }, ctx);
	}

	it("published post gets metadata.wordCount and metadata.readingTimeMinutes set", async () => {
		const content = makeContentItem({
			status: "published",
			data: { body: makeBlocks("alpha bravo charlie"), metadata: {} },
		});

		ctx.content!.get = vi.fn().mockResolvedValue({
			id: content.id,
			type: "posts",
			slug: content.slug,
			status: "published",
			data: { body: makeBlocks("alpha bravo charlie"), metadata: {} },
			createdAt: content.createdAt,
			updatedAt: content.updatedAt,
		});

		await runAfterSave(content);

		expect(ctx.content!.update).toHaveBeenCalledOnce();
		const data = (ctx.content!.update as ReturnType<typeof vi.fn>).mock.calls[0]![2];
		expect(data.metadata.wordCount).toBe(3);
		expect(data.metadata.readingTimeMinutes).toBe(1);
	});

	it("draft save does not set metadata", async () => {
		const content = makeContentItem({
			status: "draft",
			data: { body: makeBlocks("some draft text"), metadata: {} },
		});

		await runAfterSave(content);
		expect(ctx.content!.update).not.toHaveBeenCalled();
	});

	it("re-publish recalculates - values are overwritten not duplicated", async () => {
		const content = makeContentItem({
			status: "published",
			data: {
				body: makeBlocks("one two three four"),
				metadata: { wordCount: 999, readingTimeMinutes: 999, seoScore: 85 },
			},
		});

		// Existing content in DB has stale readtime values and other metadata
		ctx.content!.get = vi.fn().mockResolvedValue({
			id: content.id,
			type: "posts",
			slug: content.slug,
			status: "published",
			data: {
				body: makeBlocks("one two three four"),
				metadata: { wordCount: 999, readingTimeMinutes: 999, seoScore: 85 },
			},
			createdAt: content.createdAt,
			updatedAt: content.updatedAt,
		});

		await runAfterSave(content);

		const data = (ctx.content!.update as ReturnType<typeof vi.fn>).mock.calls[0]![2];
		// Overwritten with fresh values
		expect(data.metadata.wordCount).toBe(4);
		expect(data.metadata.readingTimeMinutes).toBe(1);
		// Other metadata preserved
		expect(data.metadata.seoScore).toBe(85);
	});

	it("hook does not throw when ctx.content.update rejects (missing metadata column)", async () => {
		// Simulates the SqliteError: no such column: metadata case when
		// the target collection has no metadata field. The afterSave hook
		// must catch and log, not crash the host's save operation.
		const content = makeContentItem({
			status: "published",
			data: { body: makeBlocks("some text"), metadata: {} },
		});

		ctx.content!.get = vi.fn().mockResolvedValue({
			id: content.id,
			type: "plugins",
			slug: content.slug,
			status: "published",
			data: { body: makeBlocks("some text") },
			createdAt: content.createdAt,
			updatedAt: content.updatedAt,
		});
		ctx.content!.update = vi.fn().mockRejectedValue(
			new Error("SqliteError: no such column: metadata"),
		);

		// Must resolve, not reject
		await expect(runAfterSave(content, "plugins")).resolves.toBeUndefined();
		expect(ctx.log.error).toHaveBeenCalledWith(
			"readtime: afterSave failed",
			expect.objectContaining({ collection: "plugins" }),
		);
	});

	it("post with known word count of 500 returns wordCount 500 and readingTimeMinutes 3", async () => {
		// Build a fixture of exactly 500 words
		const fiveHundredWords = Array.from({ length: 500 }, (_, i) => `word${i}`).join(" ");
		const content = makeContentItem({
			status: "published",
			data: { body: makeBlocks(fiveHundredWords), metadata: {} },
		});

		ctx.content!.get = vi.fn().mockResolvedValue({
			id: content.id,
			type: "posts",
			slug: content.slug,
			status: "published",
			data: { body: makeBlocks(fiveHundredWords), metadata: {} },
			createdAt: content.createdAt,
			updatedAt: content.updatedAt,
		});

		await runAfterSave(content);

		const data = (ctx.content!.update as ReturnType<typeof vi.fn>).mock.calls[0]![2];
		expect(data.metadata.wordCount).toBe(500);
		// ceil(500 / 238) = ceil(2.1008...) = 3
		expect(data.metadata.readingTimeMinutes).toBe(3);
	});
});
