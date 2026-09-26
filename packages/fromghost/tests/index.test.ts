import { describe, it, expect, vi } from "vitest";
import { createGhostSource } from "../src/index.ts";
import { ghostV4Export, ghostV5Export } from "./fixtures.ts";

function fileFor(json: unknown): File {
	return new File([JSON.stringify(json)], "export.json", {
		type: "application/json",
	});
}

const emptyContext = {};

describe("field mapping", () => {
	it("maps title and slug", async () => {
		const source = createGhostSource();
		const items = [];
		for await (const item of source.fetchContent(
			{ type: "file", file: fileFor(ghostV5Export()) },
			{ postTypes: ["post", "page"], includeDrafts: true },
		)) {
			items.push(item);
		}
		const hello = items.find((i) => i.sourceId === "1")!;
		expect(hello.title).toBe("Hello Ghost");
		expect(hello.slug).toBe("hello-ghost");
	});

	it("maps published_at to date", async () => {
		const source = createGhostSource();
		const items = [];
		for await (const item of source.fetchContent(
			{ type: "file", file: fileFor(ghostV5Export()) },
			{ postTypes: ["post"], includeDrafts: true },
		)) {
			items.push(item);
		}
		const hello = items.find((i) => i.sourceId === "1")!;
		expect(hello.date.toISOString()).toBe("2024-01-15T10:00:00.000Z");
	});

	it("maps meta_title and meta_description into meta", async () => {
		const source = createGhostSource();
		const items = [];
		for await (const item of source.fetchContent(
			{ type: "file", file: fileFor(ghostV5Export()) },
			{ postTypes: ["post"], includeDrafts: true },
		)) {
			items.push(item);
		}
		const hello = items.find((i) => i.sourceId === "1")!;
		expect(hello.meta?.["seoTitle"]).toBe("Hello Ghost | SEO");
		expect(hello.meta?.["seoDescription"]).toBe("SEO description");
	});

	it("resolves tags via the posts_tags join, dropping internal tags", async () => {
		const source = createGhostSource();
		const items = [];
		for await (const item of source.fetchContent(
			{ type: "file", file: fileFor(ghostV5Export()) },
			{ postTypes: ["post"], includeDrafts: true },
		)) {
			items.push(item);
		}
		const hello = items.find((i) => i.sourceId === "1")!;
		expect(hello.tags).toEqual(["news"]);
	});

	it("resolves the primary author from posts_authors", async () => {
		const source = createGhostSource();
		const items = [];
		for await (const item of source.fetchContent(
			{ type: "file", file: fileFor(ghostV5Export()) },
			{ postTypes: ["post"], includeDrafts: true },
		)) {
			items.push(item);
		}
		const hello = items.find((i) => i.sourceId === "1")!;
		expect(hello.author).toBe("ada");
	});
});

describe("import pipeline", () => {
	it("creates content items for each published post", async () => {
		const source = createGhostSource();
		const items = [];
		for await (const item of source.fetchContent(
			{ type: "file", file: fileFor(ghostV5Export()) },
			{ postTypes: ["post"], includeDrafts: true },
		)) {
			items.push(item);
		}
		// 2 posts (published + draft) - the page is excluded by postTypes.
		expect(items).toHaveLength(2);
	});

	it("skips draft posts when includeDrafts is false", async () => {
		const source = createGhostSource();
		const items = [];
		for await (const item of source.fetchContent(
			{ type: "file", file: fileFor(ghostV5Export()) },
			{ postTypes: ["post"], includeDrafts: false },
		)) {
			items.push(item);
		}
		expect(items).toHaveLength(1);
		expect(items[0]?.status).toBe("publish");
	});

	it("resolves the feature image URL when a siteUrl is configured", async () => {
		const source = createGhostSource({ siteUrl: "https://ada.example.com" });
		const items = [];
		for await (const item of source.fetchContent(
			{ type: "file", file: fileFor(ghostV5Export()) },
			{ postTypes: ["post"], includeDrafts: true },
		)) {
			items.push(item);
		}
		const hello = items.find((i) => i.sourceId === "1")!;
		expect(hello.featuredImage).toBe(
			"https://ada.example.com/content/images/2024/01/cover.jpg",
		);
	});

	it("skips the feature image (continues the import) when it can't be resolved to an absolute URL", async () => {
		const warn = vi.fn();
		const source = createGhostSource({ onWarn: warn });
		const items = [];
		for await (const item of source.fetchContent(
			{ type: "file", file: fileFor(ghostV5Export()) },
			{ postTypes: ["post"], includeDrafts: true },
		)) {
			items.push(item);
		}
		const hello = items.find((i) => i.sourceId === "1")!;
		expect(hello.featuredImage).toBeUndefined();
		expect(hello.title).toBe("Hello Ghost"); // import continued
		expect(warn).toHaveBeenCalledWith(expect.stringContaining("site-relative"));
	});

	it("skips duplicate slugs and warns, keeping the first occurrence", async () => {
		const warn = vi.fn();
		const source = createGhostSource({ onWarn: warn });
		const dupe = ghostV5Export();
		dupe.db[0]!.data.posts.push({
			id: "99",
			title: "Hello Ghost",
			slug: "hello-ghost",
			html: "<p>Duplicate slug post.</p>",
			status: "published",
			type: "post",
		});

		const items = [];
		for await (const item of source.fetchContent(
			{ type: "file", file: fileFor(dupe) },
			{ postTypes: ["post"], includeDrafts: true },
		)) {
			items.push(item);
		}
		const helloItems = items.filter((i) => i.slug === "hello-ghost");
		expect(helloItems).toHaveLength(1);
		expect(helloItems[0]?.sourceId).toBe("1");
		expect(warn).toHaveBeenCalledWith(expect.stringContaining("duplicate slug"));
	});

	it("warns and continues past a tag missing from the export", async () => {
		const warn = vi.fn();
		const source = createGhostSource({ onWarn: warn });
		const broken = ghostV5Export();
		broken.db[0]!.data.posts_tags.push({ post_id: "1", tag_id: "ghost-tag", sort_order: 2 });

		const items = [];
		for await (const item of source.fetchContent(
			{ type: "file", file: fileFor(broken) },
			{ postTypes: ["post"], includeDrafts: true },
		)) {
			items.push(item);
		}
		expect(warn).toHaveBeenCalledWith(expect.stringContaining("ghost-tag"));
		expect(items.find((i) => i.sourceId === "1")).toBeDefined();
	});

	it("reports correct counts and attachments via analyze", async () => {
		const source = createGhostSource({ siteUrl: "https://ada.example.com" });
		const analysis = await source.analyze(
			{ type: "file", file: fileFor(ghostV5Export()) },
			emptyContext,
		);
		const postType = analysis.postTypes.find((p) => p.name === "post");
		const pageType = analysis.postTypes.find((p) => p.name === "page");
		expect(postType?.count).toBe(2);
		expect(pageType?.count).toBe(1);
		expect(analysis.tags).toBe(1); // internal tag excluded
		expect(analysis.attachments.count).toBe(1);
		expect(analysis.authors).toHaveLength(1);
		expect(analysis.site.title).toBe("Ada's Blog");
	});

	it("handles a Ghost v4 export (page flag, no tags/authors tables)", async () => {
		const source = createGhostSource();
		const items = [];
		for await (const item of source.fetchContent(
			{ type: "file", file: fileFor(ghostV4Export()) },
			{ postTypes: ["post", "page"], includeDrafts: true },
		)) {
			items.push(item);
		}
		expect(items.find((i) => i.slug === "old-post")?.postType).toBe("post");
		expect(items.find((i) => i.slug === "old-page")?.postType).toBe("page");
	});
});

describe("shared htmlToPortableText", () => {
	it("is reused from the shared converter package (fromsubstack's shared utility)", async () => {
		const source = createGhostSource();
		const items = [];
		for await (const item of source.fetchContent(
			{ type: "file", file: fileFor(ghostV5Export()) },
			{ postTypes: ["post"], includeDrafts: true },
		)) {
			items.push(item);
		}
		const hello = items.find((i) => i.sourceId === "1")!;
		expect(hello.content).toHaveLength(1);
		expect(hello.content[0]?._type).toBe("block");
		const block = hello.content[0] as { children: Array<{ text: string }> };
		expect(block.children[0]?.text).toBe("First ");
		expect(block.children[1]?.text).toBe("post");
	});

	it("recovers plain text from a Lexical draft when html is absent", async () => {
		const warn = vi.fn();
		const source = createGhostSource({ onWarn: warn });
		const noHtml = {
			db: [
				{
					meta: { version: "5.78.0" },
					data: {
						posts: [
							{
								id: "5",
								title: "Lexical Only",
								slug: "lexical-only",
								html: null,
								lexical: JSON.stringify({
									root: { children: [{ children: [{ text: "Recovered text" }] }] },
								}),
								status: "published",
								type: "post",
							},
						],
						tags: [],
						users: [],
						posts_tags: [],
						posts_authors: [],
						settings: [],
					},
				},
			],
		};

		const items = [];
		for await (const item of source.fetchContent(
			{ type: "file", file: fileFor(noHtml) },
			{ postTypes: ["post"], includeDrafts: true },
		)) {
			items.push(item);
		}
		const post = items[0]!;
		const block = post.content[0] as { children: Array<{ text: string }> };
		expect(block.children[0]?.text).toBe("Recovered text");
		expect(warn).toHaveBeenCalledWith(expect.stringContaining("Lexical draft"));
	});
});

describe("createGhostSource", () => {
	it("rejects a non-file input", async () => {
		const source = createGhostSource();
		await expect(
			source.analyze({ type: "url", url: "https://example.com" }, emptyContext),
		).rejects.toThrow(/requires a Ghost JSON export file/);
	});

	it("rejects a file that isn't valid JSON", async () => {
		const source = createGhostSource();
		const file = new File(["not json"], "export.json", { type: "application/json" });
		await expect(
			source.analyze({ type: "file", file }, emptyContext),
		).rejects.toThrow(/not valid JSON/);
	});
});
