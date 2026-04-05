import { describe, it, expect, vi, beforeEach } from "vitest";
import { generateShareUrl, generateAllShareUrls } from "../src/sandbox-entry.ts";
import { makeContext, makeContentItem } from "@plugdash/testing";

// ── generateShareUrl ──

describe("generateShareUrl", () => {
	const baseArgs = {
		title: "My Great Post",
		url: "https://example.com/posts/my-great-post",
	};

	it("generates correct Twitter URL with title and url", () => {
		const result = generateShareUrl("twitter", baseArgs);
		expect(result).toContain("https://twitter.com/intent/tweet?");
		// URLSearchParams encodes spaces as + (valid per application/x-www-form-urlencoded)
		expect(result).toContain("text=My+Great+Post");
		expect(result).toContain("url=https%3A%2F%2Fexample.com%2Fposts%2Fmy-great-post");
	});

	it("includes via when configured", () => {
		const result = generateShareUrl("twitter", { ...baseArgs, via: "abhinavs" });
		expect(result).toContain("via=abhinavs");
	});

	it("includes hashtags when configured", () => {
		const result = generateShareUrl("twitter", {
			...baseArgs,
			hashtags: ["emdash", "cms"],
		});
		expect(result).toContain("hashtags=emdash%2Ccms");
	});

	it("generates correct LinkedIn URL", () => {
		const result = generateShareUrl("linkedin", baseArgs);
		expect(result).toBe(
			"https://www.linkedin.com/sharing/share-offsite/?url=https%3A%2F%2Fexample.com%2Fposts%2Fmy-great-post",
		);
	});

	it("generates correct WhatsApp URL", () => {
		const result = generateShareUrl("whatsapp", baseArgs);
		expect(result).toBe(
			"https://api.whatsapp.com/send?text=My%20Great%20Post%20https%3A%2F%2Fexample.com%2Fposts%2Fmy-great-post",
		);
	});

	it("generates correct Bluesky URL", () => {
		const result = generateShareUrl("bluesky", baseArgs);
		expect(result).toBe(
			"https://bsky.app/intent/compose?text=My%20Great%20Post%20https%3A%2F%2Fexample.com%2Fposts%2Fmy-great-post",
		);
	});

	it("generates correct email URL", () => {
		const result = generateShareUrl("email", baseArgs);
		expect(result).toBe(
			"mailto:?subject=My%20Great%20Post&body=My%20Great%20Post%0A%0Ahttps%3A%2F%2Fexample.com%2Fposts%2Fmy-great-post",
		);
	});

	it("URL-encodes special characters in title", () => {
		const result = generateShareUrl("twitter", {
			...baseArgs,
			title: "Hello & Goodbye: A \"Post\"",
		});
		// URLSearchParams encodes spaces as +
		expect(result).toContain("text=Hello+%26+Goodbye%3A+A+%22Post%22");
	});

	it("truncates title to 200 chars for Twitter only", () => {
		const longTitle = "A".repeat(250);
		const twitterResult = generateShareUrl("twitter", { ...baseArgs, title: longTitle });

		// Twitter should have truncated title (200 chars + "...")
		const truncated = "A".repeat(200) + "...";
		expect(twitterResult).toContain(`text=${encodeURIComponent(truncated)}`);

		// WhatsApp includes full title - no truncation
		const whatsappResult = generateShareUrl("whatsapp", { ...baseArgs, title: longTitle });
		expect(whatsappResult).toContain(`text=${encodeURIComponent(longTitle)}`);
	});
});

// ── generateAllShareUrls ──

describe("generateAllShareUrls", () => {
	it("generates URLs for all default platforms", () => {
		const result = generateAllShareUrls({
			title: "Test",
			url: "https://example.com/test",
			platforms: ["twitter", "linkedin", "whatsapp", "bluesky", "email"],
		});
		expect(Object.keys(result)).toEqual(["twitter", "linkedin", "whatsapp", "bluesky", "email"]);
	});

	it("only includes configured platforms", () => {
		const result = generateAllShareUrls({
			title: "Test",
			url: "https://example.com/test",
			platforms: ["twitter", "bluesky"],
		});
		expect(Object.keys(result)).toEqual(["twitter", "bluesky"]);
		expect(result.linkedin).toBeUndefined();
	});

	it("passes via and hashtags to Twitter URL", () => {
		const result = generateAllShareUrls({
			title: "Test",
			url: "https://example.com/test",
			platforms: ["twitter"],
			via: "abhinavs",
			hashtags: ["emdash"],
		});
		expect(result.twitter).toContain("via=abhinavs");
		expect(result.twitter).toContain("hashtags=emdash");
	});
});

// ── sharepost hook: content:afterSave ──

describe("sharepost hook: content:afterSave", () => {
	let ctx: ReturnType<typeof makeContext>;

	beforeEach(() => {
		ctx = makeContext();
	});

	async function runHook(
		content: Record<string, unknown>,
		collection = "posts",
	) {
		const plugin = await import("../src/sandbox-entry.ts");
		const hook = plugin.default.hooks!["content:afterSave"];
		const event = { content, collection, isNew: false };
		await hook.handler(event, ctx);
	}

	it("writes shareUrls to metadata on publish", async () => {
		const content = makeContentItem({
			status: "published",
			slug: "my-post",
			data: {
				title: "My Post",
				body: [],
				metadata: {},
			},
		});

		ctx.content!.get = vi.fn().mockResolvedValue({
			id: content.id,
			type: "posts",
			slug: "my-post",
			status: "published",
			data: { title: "My Post", body: [], metadata: {} },
			createdAt: content.createdAt,
			updatedAt: content.updatedAt,
		});

		await runHook(content, "posts");

		expect(ctx.content!.update).toHaveBeenCalledWith(
			"posts",
			content.id,
			expect.objectContaining({
				metadata: expect.objectContaining({
					shareUrls: expect.objectContaining({
						twitter: expect.stringContaining("twitter.com/intent/tweet"),
						linkedin: expect.stringContaining("linkedin.com/sharing"),
					}),
				}),
			}),
		);
	});

	it("only includes configured platforms", async () => {
		ctx.kv.get = vi.fn().mockImplementation((key: string) => {
			if (key === "config:platforms") return Promise.resolve(["twitter", "bluesky"]);
			return Promise.resolve(null);
		});

		const content = makeContentItem({
			status: "published",
			slug: "my-post",
			data: { title: "My Post", body: [], metadata: {} },
		});

		ctx.content!.get = vi.fn().mockResolvedValue({
			id: content.id,
			type: "posts",
			slug: "my-post",
			status: "published",
			data: { title: "My Post", body: [], metadata: {} },
			createdAt: content.createdAt,
			updatedAt: content.updatedAt,
		});

		await runHook(content, "posts");

		const updateCall = (ctx.content!.update as ReturnType<typeof vi.fn>).mock.calls[0]!;
		const shareUrls = updateCall[2].metadata.shareUrls;
		expect(shareUrls.twitter).toBeDefined();
		expect(shareUrls.bluesky).toBeDefined();
		expect(shareUrls.linkedin).toBeUndefined();
		expect(shareUrls.whatsapp).toBeUndefined();
		expect(shareUrls.email).toBeUndefined();
	});

	it("skips non-published content", async () => {
		const content = makeContentItem({ status: "draft" });
		await runHook(content);
		expect(ctx.content!.update).not.toHaveBeenCalled();
	});

	it("handles missing post URL gracefully - skips when no slug", async () => {
		const content = makeContentItem({
			status: "published",
			slug: null,
			data: { title: "No Slug Post", body: [], metadata: {} },
		});
		await runHook(content, "posts");
		expect(ctx.content!.update).not.toHaveBeenCalled();
		expect(ctx.log.warn).toHaveBeenCalled();
	});

	it("merges with existing metadata", async () => {
		const content = makeContentItem({
			status: "published",
			slug: "my-post",
			data: {
				title: "My Post",
				body: [],
				metadata: { author: "someone", wordCount: 100 },
			},
		});

		ctx.content!.get = vi.fn().mockResolvedValue({
			id: content.id,
			type: "posts",
			slug: "my-post",
			status: "published",
			data: { title: "My Post", body: [], metadata: { author: "someone", wordCount: 100 } },
			createdAt: content.createdAt,
			updatedAt: content.updatedAt,
		});

		await runHook(content, "posts");

		const updateCall = (ctx.content!.update as ReturnType<typeof vi.fn>).mock.calls[0]!;
		const updatedMeta = updateCall[2].metadata;
		expect(updatedMeta.author).toBe("someone");
		expect(updatedMeta.wordCount).toBe(100);
		expect(updatedMeta.shareUrls).toBeDefined();
	});

	it("updates on republish with new title/url", async () => {
		const content = makeContentItem({
			status: "published",
			slug: "updated-post",
			data: {
				title: "Updated Title",
				body: [],
				metadata: {
					shareUrls: {
						twitter: "https://twitter.com/intent/tweet?text=Old%20Title",
					},
				},
			},
		});

		ctx.content!.get = vi.fn().mockResolvedValue({
			id: content.id,
			type: "posts",
			slug: "updated-post",
			status: "published",
			data: {
				title: "Updated Title",
				body: [],
				metadata: {
					shareUrls: {
						twitter: "https://twitter.com/intent/tweet?text=Old%20Title",
					},
				},
			},
			createdAt: content.createdAt,
			updatedAt: content.updatedAt,
		});

		await runHook(content, "posts");

		const updateCall = (ctx.content!.update as ReturnType<typeof vi.fn>).mock.calls[0]!;
		const shareUrls = updateCall[2].metadata.shareUrls;
		expect(shareUrls.twitter).toContain("Updated+Title");
		expect(shareUrls.twitter).not.toContain("Old+Title");
	});

	it("uses collection name as fallback when title is missing", async () => {
		const content = makeContentItem({
			status: "published",
			slug: "no-title",
			data: { body: [], metadata: {} },
		});

		ctx.content!.get = vi.fn().mockResolvedValue({
			id: content.id,
			type: "posts",
			slug: "no-title",
			status: "published",
			data: { body: [], metadata: {} },
			createdAt: content.createdAt,
			updatedAt: content.updatedAt,
		});

		await runHook(content, "posts");

		const updateCall = (ctx.content!.update as ReturnType<typeof vi.fn>).mock.calls[0]!;
		const shareUrls = updateCall[2].metadata.shareUrls;
		// Should use "posts" as fallback title
		expect(shareUrls.twitter).toContain("posts");
	});
});
