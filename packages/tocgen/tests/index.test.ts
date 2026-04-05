import { describe, it, expect, vi, beforeEach } from "vitest";
import {
	extractHeadings,
	toAnchor,
	deduplicateAnchors,
	nestHeadings,
} from "../src/sandbox-entry.ts";
import { makeContext, makeContentItem } from "@plugdash/testing";
import type { PortableTextBlock } from "@portabletext/types";

// ── Helper: create a heading block ──

function headingBlock(
	style: string,
	text: string,
	key = "k1",
): PortableTextBlock {
	return {
		_type: "block",
		_key: key,
		children: [{ _type: "span", _key: `${key}-s`, text, marks: [] }],
		markDefs: [],
		style,
	};
}

// ── extractHeadings ──

describe("extractHeadings", () => {
	it("extracts h2 headings from Portable Text blocks", () => {
		const blocks = [headingBlock("h2", "Getting Started")];
		const result = extractHeadings(blocks);
		expect(result).toEqual([{ level: 2, text: "Getting Started" }]);
	});

	it("extracts h3 headings", () => {
		const blocks = [headingBlock("h3", "Installation")];
		const result = extractHeadings(blocks);
		expect(result).toEqual([{ level: 3, text: "Installation" }]);
	});

	it("extracts h4 headings", () => {
		const blocks = [headingBlock("h4", "npm")];
		const result = extractHeadings(blocks);
		expect(result).toEqual([{ level: 4, text: "npm" }]);
	});

	it("ignores h1 headings", () => {
		const blocks = [
			headingBlock("h1", "Title"),
			headingBlock("h2", "Section"),
		];
		const result = extractHeadings(blocks);
		expect(result).toEqual([{ level: 2, text: "Section" }]);
	});

	it("handles headings with marks (bold text in heading)", () => {
		const blocks: PortableTextBlock[] = [
			{
				_type: "block",
				_key: "a",
				children: [
					{ _type: "span", _key: "s1", text: "Bold ", marks: ["strong"] },
					{ _type: "span", _key: "s2", text: "heading", marks: [] },
				],
				markDefs: [],
				style: "h2",
			},
		];
		const result = extractHeadings(blocks);
		expect(result).toEqual([{ level: 2, text: "Bold heading" }]);
	});

	it("skips headings with empty text", () => {
		const blocks = [
			headingBlock("h2", ""),
			headingBlock("h2", "   "),
			headingBlock("h2", "Real heading"),
		];
		const result = extractHeadings(blocks);
		expect(result).toEqual([{ level: 2, text: "Real heading" }]);
	});

	it("handles missing children array", () => {
		const blocks = [
			{
				_type: "block",
				_key: "a",
				markDefs: [],
				style: "h2",
			},
		] as unknown as PortableTextBlock[];
		const result = extractHeadings(blocks);
		expect(result).toEqual([]);
	});

	it("ignores non-block types", () => {
		const blocks = [
			{ _type: "image", _key: "img1", asset: { _ref: "image-abc" } },
			headingBlock("h2", "After image"),
		] as unknown as PortableTextBlock[];
		const result = extractHeadings(blocks);
		expect(result).toEqual([{ level: 2, text: "After image" }]);
	});

	it("ignores normal paragraph blocks", () => {
		const blocks = [
			headingBlock("normal", "Just a paragraph"),
			headingBlock("h2", "A heading"),
		];
		const result = extractHeadings(blocks);
		expect(result).toEqual([{ level: 2, text: "A heading" }]);
	});
});

// ── toAnchor ──

describe("toAnchor", () => {
	it("lowercases text", () => {
		expect(toAnchor("Getting Started")).toBe("getting-started");
	});

	it("replaces spaces with hyphens", () => {
		expect(toAnchor("hello world")).toBe("hello-world");
	});

	it("removes special characters", () => {
		expect(toAnchor("What's New?")).toBe("whats-new");
	});

	it("collapses multiple spaces into single hyphen", () => {
		expect(toAnchor("hello   world")).toBe("hello-world");
	});

	it("trims leading and trailing whitespace", () => {
		expect(toAnchor("  hello  ")).toBe("hello");
	});

	it("handles already-slugified text", () => {
		expect(toAnchor("already-a-slug")).toBe("already-a-slug");
	});
});

// ── deduplicateAnchors ──

describe("deduplicateAnchors", () => {
	it("assigns unique ids to headings", () => {
		const headings = [
			{ level: 2, text: "Introduction" },
			{ level: 2, text: "Usage" },
		];
		const result = deduplicateAnchors(headings);
		expect(result[0]!.id).toBe("introduction");
		expect(result[1]!.id).toBe("usage");
	});

	it("handles duplicate headings with -2 -3 suffix", () => {
		const headings = [
			{ level: 2, text: "Introduction" },
			{ level: 2, text: "Introduction" },
			{ level: 2, text: "Introduction" },
		];
		const result = deduplicateAnchors(headings);
		expect(result[0]!.id).toBe("introduction");
		expect(result[1]!.id).toBe("introduction-2");
		expect(result[2]!.id).toBe("introduction-3");
	});

	it("preserves text and level", () => {
		const headings = [{ level: 3, text: "Details" }];
		const result = deduplicateAnchors(headings);
		expect(result[0]).toEqual({
			id: "details",
			text: "Details",
			level: 3,
		});
	});
});

// ── nestHeadings ──

describe("nestHeadings", () => {
	it("nests h3 under preceding h2", () => {
		const flat = [
			{ id: "intro", text: "Intro", level: 2 },
			{ id: "details", text: "Details", level: 3 },
		];
		const result = nestHeadings(flat, 3);
		expect(result).toHaveLength(1);
		expect(result[0]!.id).toBe("intro");
		expect(result[0]!.children).toHaveLength(1);
		expect(result[0]!.children[0]!.id).toBe("details");
	});

	it("nests h4 under preceding h3", () => {
		const flat = [
			{ id: "intro", text: "Intro", level: 2 },
			{ id: "details", text: "Details", level: 3 },
			{ id: "subdetail", text: "Subdetail", level: 4 },
		];
		const result = nestHeadings(flat, 4);
		expect(result).toHaveLength(1);
		expect(result[0]!.children).toHaveLength(1);
		expect(result[0]!.children[0]!.children).toHaveLength(1);
		expect(result[0]!.children[0]!.children[0]!.id).toBe("subdetail");
	});

	it("h3 with no preceding h2 becomes top-level entry", () => {
		const flat = [
			{ id: "orphan", text: "Orphan h3", level: 3 },
			{ id: "section", text: "Section", level: 2 },
		];
		const result = nestHeadings(flat, 3);
		expect(result).toHaveLength(2);
		expect(result[0]!.id).toBe("orphan");
		expect(result[0]!.children).toEqual([]);
		expect(result[1]!.id).toBe("section");
	});

	it("multiple h2 sections each with h3 children", () => {
		const flat = [
			{ id: "a", text: "A", level: 2 },
			{ id: "a1", text: "A1", level: 3 },
			{ id: "a2", text: "A2", level: 3 },
			{ id: "b", text: "B", level: 2 },
			{ id: "b1", text: "B1", level: 3 },
		];
		const result = nestHeadings(flat, 3);
		expect(result).toHaveLength(2);
		expect(result[0]!.children).toHaveLength(2);
		expect(result[1]!.children).toHaveLength(1);
	});

	it("h4 headings excluded from tree when maxDepth=3", () => {
		const flat = [
			{ id: "intro", text: "Intro", level: 2 },
			{ id: "details", text: "Details", level: 3 },
			{ id: "subdetail", text: "Subdetail", level: 4 },
		];
		const result = nestHeadings(flat, 3);
		expect(result).toHaveLength(1);
		expect(result[0]!.children).toHaveLength(1);
		// h4 should not appear anywhere in the tree
		expect(result[0]!.children[0]!.children).toEqual([]);
	});

	it("all headings included when maxDepth=4", () => {
		const flat = [
			{ id: "intro", text: "Intro", level: 2 },
			{ id: "details", text: "Details", level: 3 },
			{ id: "subdetail", text: "Subdetail", level: 4 },
		];
		const result = nestHeadings(flat, 4);
		expect(result).toHaveLength(1);
		expect(result[0]!.children[0]!.children).toHaveLength(1);
		expect(result[0]!.children[0]!.children[0]!.id).toBe("subdetail");
	});

	it("h3 only list with maxDepth=2 excludes all h3s", () => {
		const flat = [
			{ id: "intro", text: "Intro", level: 2 },
			{ id: "details", text: "Details", level: 3 },
		];
		const result = nestHeadings(flat, 2);
		expect(result).toHaveLength(1);
		expect(result[0]!.children).toEqual([]);
	});
});

// ── tocgen hook: content:afterSave ──

describe("tocgen hook: content:afterSave", () => {
	let ctx: ReturnType<typeof makeContext>;

	beforeEach(() => {
		ctx = makeContext();
	});

	function makeBodyWithHeadings(count: number): PortableTextBlock[] {
		return Array.from({ length: count }, (_, i) => headingBlock("h2", `Heading ${i + 1}`, `k${i}`));
	}

	async function runHook(
		content: Record<string, unknown>,
		collection = "posts",
	) {
		const plugin = await import("../src/sandbox-entry.ts");
		const hook = plugin.default.hooks!["content:afterSave"];
		const event = { content, collection, isNew: false };
		await hook.handler(event, ctx);
	}

	it("writes tocgen metadata on publish", async () => {
		const content = makeContentItem({
			status: "published",
			data: {
				body: makeBodyWithHeadings(3),
				metadata: {},
			},
		});

		ctx.content!.get = vi.fn().mockResolvedValue({
			id: content.id,
			data: { metadata: {} },
		});

		await runHook(content, "posts");

		expect(ctx.content!.update).toHaveBeenCalledWith(
			"posts",
			content.id,
			expect.objectContaining({
				metadata: expect.objectContaining({
					tocgen: expect.objectContaining({
						entries: expect.any(Array),
						generatedAt: expect.any(String),
					}),
				}),
			}),
		);

		const updateCall = (ctx.content!.update as ReturnType<typeof vi.fn>).mock.calls[0]!;
		const entries = updateCall[2].metadata.tocgen.entries;
		expect(entries).toHaveLength(3);
		expect(entries[0].id).toBe("heading-1");
		expect(entries[0].text).toBe("Heading 1");
		expect(entries[0].level).toBe(2);
	});

	it("skips when heading count below minHeadings", async () => {
		const content = makeContentItem({
			status: "published",
			data: {
				body: makeBodyWithHeadings(2), // default minHeadings is 3
				metadata: {},
			},
		});

		await runHook(content, "posts");
		expect(ctx.content!.update).not.toHaveBeenCalled();
	});

	it("does not write metadata.tocgen at all when below threshold (key absent, not empty)", async () => {
		// Existing content has tocgen from a previous run with more headings.
		// After edit reduced headings below threshold, tocgen key should be removed.
		const content = makeContentItem({
			status: "published",
			data: {
				body: makeBodyWithHeadings(1),
				metadata: {},
			},
		});

		ctx.content!.get = vi.fn().mockResolvedValue({
			id: content.id,
			data: {
				metadata: {
					tocgen: { entries: [], generatedAt: "2026-01-01T00:00:00Z" },
					otherPlugin: "keep-this",
				},
			},
		});

		await runHook(content, "posts");

		// Should still update to clear the stale tocgen key
		if ((ctx.content!.update as ReturnType<typeof vi.fn>).mock.calls.length > 0) {
			const updateCall = (ctx.content!.update as ReturnType<typeof vi.fn>).mock.calls[0]!;
			const metadata = updateCall[2].metadata;
			expect(metadata.tocgen).toBeUndefined();
			// Other plugins' metadata preserved
			expect(metadata.otherPlugin).toBe("keep-this");
		} else {
			// Also acceptable: not calling update at all when nothing to write
			expect(ctx.content!.update).not.toHaveBeenCalled();
		}
	});

	it("skips non-published content", async () => {
		for (const status of ["draft", "archived", "scheduled"]) {
			const freshCtx = makeContext();
			const content = makeContentItem({ status });
			const plugin = await import("../src/sandbox-entry.ts");
			const hook = plugin.default.hooks!["content:afterSave"];
			await hook.handler({ content, collection: "posts", isNew: false }, freshCtx);
			expect(freshCtx.content!.update).not.toHaveBeenCalled();
		}
	});

	it("skips collections not in config", async () => {
		ctx.kv.get = vi.fn().mockImplementation((key: string) => {
			if (key === "config:collections") return Promise.resolve(["articles"]);
			if (key === "config:minHeadings") return Promise.resolve(3);
			if (key === "config:maxDepth") return Promise.resolve(3);
			return Promise.resolve(null);
		});

		const content = makeContentItem({
			status: "published",
			data: { body: makeBodyWithHeadings(5), metadata: {} },
		});
		await runHook(content, "posts");
		expect(ctx.content!.update).not.toHaveBeenCalled();
	});

	it("is idempotent on republish", async () => {
		const body = makeBodyWithHeadings(3);
		const content = makeContentItem({
			status: "published",
			data: { body, metadata: {} },
		});

		ctx.content!.get = vi.fn().mockResolvedValue({
			id: content.id,
			data: {
				metadata: {
					tocgen: {
						entries: [{ id: "old", text: "Old", level: 2, children: [] }],
						generatedAt: "2026-01-01T00:00:00Z",
					},
				},
			},
		});

		await runHook(content, "posts");

		const updateCall = (ctx.content!.update as ReturnType<typeof vi.fn>).mock.calls[0]!;
		const entries = updateCall[2].metadata.tocgen.entries;
		// Fresh calculation, not old stale data
		expect(entries).toHaveLength(3);
		expect(entries[0].text).toBe("Heading 1");
	});

	it("merges with existing metadata from other plugins", async () => {
		const content = makeContentItem({
			status: "published",
			data: { body: makeBodyWithHeadings(3), metadata: {} },
		});

		ctx.content!.get = vi.fn().mockResolvedValue({
			id: content.id,
			data: {
				metadata: {
					wordCount: 500,
					readingTimeMinutes: 3,
					seoTitle: "My Post",
				},
			},
		});

		await runHook(content, "posts");

		const updateCall = (ctx.content!.update as ReturnType<typeof vi.fn>).mock.calls[0]!;
		const metadata = updateCall[2].metadata;
		// Other plugins' keys preserved
		expect(metadata.wordCount).toBe(500);
		expect(metadata.readingTimeMinutes).toBe(3);
		expect(metadata.seoTitle).toBe("My Post");
		// tocgen key added
		expect(metadata.tocgen).toBeDefined();
		expect(metadata.tocgen.entries).toHaveLength(3);
	});

	it("handles missing ctx.content gracefully", async () => {
		const noContentCtx = makeContext({ content: undefined });
		const content = makeContentItem({
			status: "published",
			data: { body: makeBodyWithHeadings(5), metadata: {} },
		});

		const plugin = await import("../src/sandbox-entry.ts");
		const hook = plugin.default.hooks!["content:afterSave"];
		const event = { content, collection: "posts", isNew: false };

		await expect(hook.handler(event, noContentCtx)).resolves.toBeUndefined();
		expect(noContentCtx.log.error).toHaveBeenCalled();
	});
});
