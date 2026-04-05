import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeContext, makeContentItem } from "@plugdash/testing";
import type { PortableTextBlock } from "@portabletext/types";

// ── Helpers ──

function headingBlock(style: string, text: string, key = "k1"): PortableTextBlock {
	return {
		_type: "block",
		_key: key,
		children: [{ _type: "span", _key: `${key}-s`, text, marks: [] }],
		markDefs: [],
		style,
	};
}

function paragraphBlock(text: string, key = "p1"): PortableTextBlock {
	return {
		_type: "block",
		_key: key,
		children: [{ _type: "span", _key: `${key}-s`, text, marks: [] }],
		markDefs: [],
		style: "normal",
	};
}

function buildRealisticBody(): PortableTextBlock[] {
	return [
		paragraphBlock("Welcome to this guide on building plugins.", "p0"),
		headingBlock("h2", "Getting Started", "h1"),
		paragraphBlock("First, install the package.", "p1"),
		headingBlock("h3", "Prerequisites", "h2"),
		paragraphBlock("You need Node.js 18+.", "p2"),
		headingBlock("h3", "Installation", "h3"),
		paragraphBlock("Run npm install.", "p3"),
		headingBlock("h2", "Configuration", "h4"),
		paragraphBlock("Configure your plugin in astro.config.mjs.", "p4"),
		headingBlock("h3", "Basic Options", "h5"),
		paragraphBlock("Set the minHeadings option.", "p5"),
		headingBlock("h3", "Advanced Options", "h6"),
		paragraphBlock("Use collections to filter.", "p6"),
		headingBlock("h2", "Usage", "h7"),
		paragraphBlock("Import the component.", "p7"),
		headingBlock("h4", "Astro Usage", "h8"),
		paragraphBlock("Use in .astro files.", "p8"),
	];
}

// ── Full lifecycle tests ──

describe("tocgen integration: full lifecycle", () => {
	let ctx: ReturnType<typeof makeContext>;

	beforeEach(() => {
		ctx = makeContext();
	});

	async function runInstall() {
		const plugin = await import("../src/sandbox-entry.ts");
		const hook = plugin.default.hooks!["plugin:install"];
		await hook.handler({}, ctx);
	}

	async function runAfterSave(
		content: Record<string, unknown>,
		collection = "posts",
	) {
		const plugin = await import("../src/sandbox-entry.ts");
		const hook = plugin.default.hooks!["content:afterSave"];
		await hook.handler({ content, collection, isNew: false }, ctx);
	}

	it("install seeds KV defaults then afterSave produces correct TOC", async () => {
		// Step 1: Run install hook
		await runInstall();

		expect(ctx.kv.set).toHaveBeenCalledWith("config:minHeadings", 3);
		expect(ctx.kv.set).toHaveBeenCalledWith("config:maxDepth", 3);

		// Step 2: Simulate afterSave with realistic content
		const body = buildRealisticBody();
		const content = makeContentItem({
			status: "published",
			data: { body, metadata: {} },
		});

		ctx.content!.get = vi.fn().mockResolvedValue({
			id: content.id,
			data: { metadata: {} },
		});

		await runAfterSave(content);

		// Step 3: Verify TOC structure
		const updateCall = (ctx.content!.update as ReturnType<typeof vi.fn>).mock.calls[0]!;
		const tocgen = updateCall[2].metadata.tocgen;

		expect(tocgen.entries).toHaveLength(3); // 3 top-level h2s
		expect(tocgen.generatedAt).toBeDefined();

		// First h2: "Getting Started" with 2 h3 children
		const first = tocgen.entries[0];
		expect(first.id).toBe("getting-started");
		expect(first.text).toBe("Getting Started");
		expect(first.level).toBe(2);
		expect(first.children).toHaveLength(2);
		expect(first.children[0].id).toBe("prerequisites");
		expect(first.children[1].id).toBe("installation");

		// Second h2: "Configuration" with 2 h3 children
		const second = tocgen.entries[1];
		expect(second.id).toBe("configuration");
		expect(second.children).toHaveLength(2);
		expect(second.children[0].id).toBe("basic-options");
		expect(second.children[1].id).toBe("advanced-options");

		// Third h2: "Usage" with no h3 children (h4 excluded at maxDepth=3)
		const third = tocgen.entries[2];
		expect(third.id).toBe("usage");
		expect(third.children).toHaveLength(0);
	});

	it("install then afterSave with maxDepth=4 includes h4 nesting", async () => {
		// Override KV to return maxDepth=4
		ctx.kv.get = vi.fn().mockImplementation((key: string) => {
			if (key === "config:minHeadings") return Promise.resolve(3);
			if (key === "config:maxDepth") return Promise.resolve(4);
			if (key === "config:collections") return Promise.resolve(null);
			return Promise.resolve(null);
		});

		const body = buildRealisticBody();
		const content = makeContentItem({
			status: "published",
			data: { body, metadata: {} },
		});

		ctx.content!.get = vi.fn().mockResolvedValue({
			id: content.id,
			data: { metadata: {} },
		});

		await runAfterSave(content);

		const updateCall = (ctx.content!.update as ReturnType<typeof vi.fn>).mock.calls[0]!;
		const tocgen = updateCall[2].metadata.tocgen;

		// "Usage" h2 should now have "Astro Usage" h4 nested under it
		// But h4 nests under preceding h3, and there is no h3 under "Usage" -
		// so h4 falls back to nesting under the h2
		const usage = tocgen.entries[2];
		expect(usage.id).toBe("usage");
		expect(usage.children).toHaveLength(1);
		expect(usage.children[0].id).toBe("astro-usage");
		expect(usage.children[0].level).toBe(4);
	});

	it("edit reduces headings below threshold - cleans up stale tocgen key", async () => {
		const content = makeContentItem({
			status: "published",
			data: {
				body: [headingBlock("h2", "Only One", "h1")],
				metadata: {},
			},
		});

		// Existing content has tocgen from a previous save with more headings
		ctx.content!.get = vi.fn().mockResolvedValue({
			id: content.id,
			data: {
				metadata: {
					tocgen: {
						entries: [{ id: "old", text: "Old", level: 2, children: [] }],
						generatedAt: "2026-01-01T00:00:00Z",
					},
					wordCount: 100,
				},
			},
		});

		await runAfterSave(content);

		// Should update to remove tocgen while preserving wordCount
		const updateCall = (ctx.content!.update as ReturnType<typeof vi.fn>).mock.calls[0]!;
		const metadata = updateCall[2].metadata;
		expect(metadata.tocgen).toBeUndefined();
		expect(metadata.wordCount).toBe(100);
	});

	it("draft -> published transition triggers TOC generation", async () => {
		const body = [
			headingBlock("h2", "One", "h1"),
			headingBlock("h2", "Two", "h2"),
			headingBlock("h2", "Three", "h3"),
		];

		// First save as draft - no update
		const draftContent = makeContentItem({
			status: "draft",
			data: { body, metadata: {} },
		});
		await runAfterSave(draftContent);
		expect(ctx.content!.update).not.toHaveBeenCalled();

		// Now publish - should generate TOC
		const publishedContent = makeContentItem({
			status: "published",
			data: { body, metadata: {} },
		});

		ctx.content!.get = vi.fn().mockResolvedValue({
			id: publishedContent.id,
			data: { metadata: {} },
		});

		await runAfterSave(publishedContent);
		expect(ctx.content!.update).toHaveBeenCalled();

		const updateCall = (ctx.content!.update as ReturnType<typeof vi.fn>).mock.calls[0]!;
		expect(updateCall[2].metadata.tocgen.entries).toHaveLength(3);
	});

	it("collection filtering respects KV config through full flow", async () => {
		ctx.kv.get = vi.fn().mockImplementation((key: string) => {
			if (key === "config:collections") return Promise.resolve(["articles", "guides"]);
			if (key === "config:minHeadings") return Promise.resolve(3);
			if (key === "config:maxDepth") return Promise.resolve(3);
			return Promise.resolve(null);
		});

		const body = buildRealisticBody();
		const content = makeContentItem({
			status: "published",
			data: { body, metadata: {} },
		});

		// "posts" not in allowed list
		await runAfterSave(content, "posts");
		expect(ctx.content!.update).not.toHaveBeenCalled();

		// "articles" is in allowed list
		ctx.content!.get = vi.fn().mockResolvedValue({
			id: content.id,
			data: { metadata: {} },
		});

		await runAfterSave(content, "articles");
		expect(ctx.content!.update).toHaveBeenCalled();
	});

	it("duplicate headings get unique anchors through full flow", async () => {
		const body = [
			headingBlock("h2", "Overview", "h1"),
			headingBlock("h3", "Details", "h2"),
			headingBlock("h2", "Overview", "h3"),
			headingBlock("h3", "Details", "h4"),
		];

		const content = makeContentItem({
			status: "published",
			data: { body, metadata: {} },
		});

		ctx.content!.get = vi.fn().mockResolvedValue({
			id: content.id,
			data: { metadata: {} },
		});

		await runAfterSave(content);

		const updateCall = (ctx.content!.update as ReturnType<typeof vi.fn>).mock.calls[0]!;
		const entries = updateCall[2].metadata.tocgen.entries;

		expect(entries[0].id).toBe("overview");
		expect(entries[0].children[0].id).toBe("details");
		expect(entries[1].id).toBe("overview-2");
		expect(entries[1].children[0].id).toBe("details-2");
	});

	it("preserves metadata from multiple other plugins", async () => {
		const body = buildRealisticBody();
		const content = makeContentItem({
			status: "published",
			data: { body, metadata: {} },
		});

		ctx.content!.get = vi.fn().mockResolvedValue({
			id: content.id,
			data: {
				metadata: {
					wordCount: 1200,
					readingTimeMinutes: 5,
					sharepost: { platforms: ["twitter", "linkedin"] },
					shortlink: { code: "abc123" },
				},
			},
		});

		await runAfterSave(content);

		const updateCall = (ctx.content!.update as ReturnType<typeof vi.fn>).mock.calls[0]!;
		const metadata = updateCall[2].metadata;

		expect(metadata.wordCount).toBe(1200);
		expect(metadata.readingTimeMinutes).toBe(5);
		expect(metadata.sharepost).toEqual({ platforms: ["twitter", "linkedin"] });
		expect(metadata.shortlink).toEqual({ code: "abc123" });
		expect(metadata.tocgen.entries).toHaveLength(3);
	});
});
