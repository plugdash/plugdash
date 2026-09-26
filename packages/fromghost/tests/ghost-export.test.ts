import { describe, it, expect } from "vitest";
import {
	buildJoinIndex,
	buildTagLookup,
	buildUserLookup,
	ghostPostType,
	lexicalToHtml,
	mapGhostStatus,
	parseGhostDate,
	parseGhostExport,
	resolveGhostUrl,
	describeImageUrl,
} from "../src/ghost-export.ts";
import { ghostV4Export, ghostV5Export } from "./fixtures.ts";

describe("Ghost JSON parsing", () => {
	it("parses a valid Ghost v5 export", () => {
		const parsed = parseGhostExport(ghostV5Export());
		expect(parsed.version).toBe("5.78.0");
		expect(parsed.data.posts).toHaveLength(3);
		expect(parsed.data.tags).toHaveLength(2);
	});

	it("parses a valid Ghost v4 export", () => {
		const parsed = parseGhostExport(ghostV4Export());
		expect(parsed.version).toBe("4.32.2");
		expect(parsed.data.posts).toHaveLength(2);
	});

	it("accepts a bare { data } export with no db wrapper", () => {
		const parsed = parseGhostExport({ data: { posts: [{ id: "1" }] } });
		expect(parsed.version).toBe("unknown");
		expect(parsed.data.posts).toHaveLength(1);
	});

	it("accepts a bare { posts } export with no data wrapper", () => {
		const parsed = parseGhostExport({ posts: [{ id: "1" }] });
		expect(parsed.data.posts).toHaveLength(1);
	});

	it("throws on JSON with no recognisable Ghost tables", () => {
		expect(() => parseGhostExport({ foo: "bar" })).toThrow(/Not a Ghost export/);
	});

	it("throws on non-object JSON", () => {
		expect(() => parseGhostExport([1, 2, 3])).toThrow();
	});

	it("builds tag lookup map correctly", () => {
		const { data } = parseGhostExport(ghostV5Export());
		const lookup = buildTagLookup(data.tags);
		expect(lookup.get("t1")?.name).toBe("News");
		expect(lookup.get("t2")?.visibility).toBe("internal");
		expect(lookup.get("missing")).toBeUndefined();
	});

	it("builds author lookup map correctly", () => {
		const { data } = parseGhostExport(ghostV5Export());
		const lookup = buildUserLookup(data.users);
		expect(lookup.get("u1")?.name).toBe("Ada Lovelace");
	});
});

describe("field mapping helpers", () => {
	it("resolves the posts_tags join in Ghost's sort order", () => {
		const { data } = parseGhostExport(ghostV5Export());
		const index = buildJoinIndex(data.posts_tags, "tag_id");
		expect(index.get("1")).toEqual(["t1", "t2"]);
		expect(index.get("2")).toBeUndefined();
	});

	it("resolves the posts_authors join", () => {
		const { data } = parseGhostExport(ghostV5Export());
		const index = buildJoinIndex(data.posts_authors, "author_id");
		expect(index.get("1")).toEqual(["u1"]);
	});

	it("maps Ghost 5 type field to post/page", () => {
		expect(ghostPostType({ type: "page" })).toBe("page");
		expect(ghostPostType({ type: "post" })).toBe("post");
	});

	it("maps Ghost 4 page flag to post/page", () => {
		expect(ghostPostType({ page: true })).toBe("page");
		expect(ghostPostType({ page: false })).toBe("post");
		expect(ghostPostType({})).toBe("post");
	});

	it("maps Ghost statuses onto EmDash statuses", () => {
		expect(mapGhostStatus("published")).toBe("publish");
		expect(mapGhostStatus("draft")).toBe("draft");
		expect(mapGhostStatus("scheduled")).toBe("future");
		expect(mapGhostStatus("sent")).toBe("private");
		expect(mapGhostStatus(null)).toBe("draft");
	});

	it("parses published_at into a Date", () => {
		const date = parseGhostDate("2024-01-15T10:00:00.000Z");
		expect(date?.toISOString()).toBe("2024-01-15T10:00:00.000Z");
	});

	it("returns undefined for a missing or invalid date", () => {
		expect(parseGhostDate(null)).toBeUndefined();
		expect(parseGhostDate("not-a-date")).toBeUndefined();
	});

	it("expands the __GHOST_URL__ placeholder against the site URL", () => {
		const resolved = resolveGhostUrl(
			"__GHOST_URL__/content/images/a.jpg",
			"https://ada.example.com",
		);
		expect(resolved).toBe("https://ada.example.com/content/images/a.jpg");
	});

	it("leaves a site-relative path when no site URL is configured", () => {
		const resolved = resolveGhostUrl("__GHOST_URL__/content/images/a.jpg", "");
		expect(resolved).toBe("/content/images/a.jpg");
	});

	it("passes already-absolute URLs through unchanged", () => {
		const resolved = resolveGhostUrl("https://cdn.example.com/a.jpg", "");
		expect(resolved).toBe("https://cdn.example.com/a.jpg");
	});

	it("describes an image URL's filename and mime type", () => {
		expect(describeImageUrl("https://x.com/a/cover.jpg")).toEqual({
			filename: "cover.jpg",
			mimeType: "image/jpeg",
		});
	});
});

describe("Lexical fallback", () => {
	it("flattens a Lexical draft's text nodes into paragraphs", () => {
		const lexical = JSON.stringify({
			root: {
				children: [
					{ children: [{ text: "Hello " }, { text: "world" }] },
					{ children: [{ text: "Second paragraph" }] },
				],
			},
		});
		expect(lexicalToHtml(lexical)).toBe(
			"<p>Hello world</p><p>Second paragraph</p>",
		);
	});

	it("escapes HTML-significant characters recovered from Lexical text", () => {
		const lexical = JSON.stringify({
			root: { children: [{ children: [{ text: "<script>&" }] }] },
		});
		expect(lexicalToHtml(lexical)).toBe("<p>&lt;script&gt;&amp;</p>");
	});

	it("returns null for malformed Lexical JSON", () => {
		expect(lexicalToHtml("not json")).toBeNull();
	});

	it("returns null when there is no text to recover", () => {
		const lexical = JSON.stringify({ root: { children: [] } });
		expect(lexicalToHtml(lexical)).toBeNull();
	});
});
