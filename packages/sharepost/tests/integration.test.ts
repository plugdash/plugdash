import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeContext, makeContentItem } from "@plugdash/testing";

// Integration tests: full lifecycle from install through publish to metadata output

describe("sharepost integration: full lifecycle", () => {
	let ctx: ReturnType<typeof makeContext>;
	let plugin: typeof import("../src/sandbox-entry.ts");

	beforeEach(async () => {
		ctx = makeContext();
		plugin = await import("../src/sandbox-entry.ts");
	});

	async function runInstall() {
		const hook = plugin.default.hooks["plugin:install"];
		await hook.handler({}, ctx);
	}

	async function runAfterSave(
		content: Record<string, unknown>,
		collection = "posts",
	) {
		const hook = plugin.default.hooks["content:afterSave"];
		const event = { content, collection, isNew: false };
		await hook.handler(event, ctx);
	}

	it("install seeds default platforms config in KV", async () => {
		await runInstall();

		expect(ctx.kv.set).toHaveBeenCalledWith(
			"config:platforms",
			["twitter", "linkedin", "whatsapp", "bluesky", "email"],
		);
		expect(ctx.log.info).toHaveBeenCalledWith(
			expect.stringContaining("installed"),
		);
	});

	it("full lifecycle: install -> publish -> metadata has shareUrls", async () => {
		// Step 1: Install seeds defaults
		await runInstall();

		// Step 2: Configure KV to return seeded values
		const kvStore: Record<string, unknown> = {
			"config:platforms": ["twitter", "linkedin", "whatsapp", "bluesky", "email"],
		};
		ctx.kv.get = vi.fn().mockImplementation((key: string) =>
			Promise.resolve(kvStore[key] ?? null),
		);

		// Step 3: Publish a post
		const content = makeContentItem({
			status: "published",
			slug: "hello-world",
			data: {
				title: "Hello World",
				body: [],
				metadata: {},
			},
		});

		ctx.content!.get = vi.fn().mockResolvedValue({
			id: content.id,
			type: "posts",
			slug: "hello-world",
			status: "published",
			data: { title: "Hello World", body: [], metadata: {} },
			createdAt: content.createdAt,
			updatedAt: content.updatedAt,
		});

		await runAfterSave(content, "posts");

		// Step 4: Verify metadata was written with all 5 platforms
		expect(ctx.content!.update).toHaveBeenCalledOnce();
		const updateCall = (ctx.content!.update as ReturnType<typeof vi.fn>).mock.calls[0];
		expect(updateCall[0]).toBe("posts");
		expect(updateCall[1]).toBe(content.id);

		const shareUrls = updateCall[2].metadata.shareUrls;
		expect(Object.keys(shareUrls)).toHaveLength(5);
		expect(shareUrls.twitter).toContain("twitter.com/intent/tweet");
		expect(shareUrls.linkedin).toContain("linkedin.com/sharing");
		expect(shareUrls.whatsapp).toContain("api.whatsapp.com/send");
		expect(shareUrls.bluesky).toContain("bsky.app/intent/compose");
		expect(shareUrls.email).toContain("mailto:");
	});

	it("URLs contain correct post URL from ctx.url()", async () => {
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

		await runAfterSave(content, "posts");

		const updateCall = (ctx.content!.update as ReturnType<typeof vi.fn>).mock.calls[0];
		const shareUrls = updateCall[2].metadata.shareUrls;

		// ctx.url() in makeContext returns https://example.com + path
		const expectedUrl = encodeURIComponent("https://example.com/posts/my-post");
		expect(shareUrls.linkedin).toContain(expectedUrl);
	});

	it("via and hashtags config flows through to Twitter URL", async () => {
		const kvStore: Record<string, unknown> = {
			"config:platforms": ["twitter"],
			"config:via": "abhinavs",
			"config:hashtags": ["emdash", "cms"],
		};
		ctx.kv.get = vi.fn().mockImplementation((key: string) =>
			Promise.resolve(kvStore[key] ?? null),
		);

		const content = makeContentItem({
			status: "published",
			slug: "test",
			data: { title: "Test", body: [], metadata: {} },
		});

		ctx.content!.get = vi.fn().mockResolvedValue({
			id: content.id,
			type: "posts",
			slug: "test",
			status: "published",
			data: { title: "Test", body: [], metadata: {} },
			createdAt: content.createdAt,
			updatedAt: content.updatedAt,
		});

		await runAfterSave(content, "posts");

		const updateCall = (ctx.content!.update as ReturnType<typeof vi.fn>).mock.calls[0];
		const twitterUrl = updateCall[2].metadata.shareUrls.twitter;
		expect(twitterUrl).toContain("via=abhinavs");
		expect(twitterUrl).toContain("hashtags=emdash%2Ccms");
	});

	it("preserves metadata from other plugins during merge", async () => {
		const content = makeContentItem({
			status: "published",
			slug: "test",
			data: {
				title: "Test",
				body: [],
				metadata: {
					wordCount: 500,
					readingTimeMinutes: 3,
					author: "someone",
				},
			},
		});

		ctx.content!.get = vi.fn().mockResolvedValue({
			id: content.id,
			type: "posts",
			slug: "test",
			status: "published",
			data: {
				title: "Test",
				body: [],
				metadata: {
					wordCount: 500,
					readingTimeMinutes: 3,
					author: "someone",
				},
			},
			createdAt: content.createdAt,
			updatedAt: content.updatedAt,
		});

		await runAfterSave(content, "posts");

		const updateCall = (ctx.content!.update as ReturnType<typeof vi.fn>).mock.calls[0];
		const metadata = updateCall[2].metadata;

		// Other plugins' fields preserved
		expect(metadata.wordCount).toBe(500);
		expect(metadata.readingTimeMinutes).toBe(3);
		expect(metadata.author).toBe("someone");
		// Our field added
		expect(metadata.shareUrls).toBeDefined();
	});

	it("draft -> publish -> draft cycle: only writes on publish", async () => {
		const baseContent = {
			id: "content-001",
			slug: "lifecycle-test",
			data: { title: "Lifecycle", body: [], metadata: {} },
			createdAt: "2026-01-01T00:00:00Z",
			updatedAt: "2026-01-01T00:00:00Z",
		};

		// Draft save - should not write
		await runAfterSave({ ...baseContent, status: "draft" }, "posts");
		expect(ctx.content!.update).not.toHaveBeenCalled();

		// Publish - should write
		ctx.content!.get = vi.fn().mockResolvedValue({
			...baseContent,
			type: "posts",
			status: "published",
		});

		await runAfterSave({ ...baseContent, status: "published" }, "posts");
		expect(ctx.content!.update).toHaveBeenCalledOnce();

		// Reset and unpublish (archived) - should not write again
		(ctx.content!.update as ReturnType<typeof vi.fn>).mockClear();
		await runAfterSave({ ...baseContent, status: "archived" }, "posts");
		expect(ctx.content!.update).not.toHaveBeenCalled();
	});

	it("handles content capability being unavailable", async () => {
		const noContentCtx = makeContext({ content: undefined });
		const content = makeContentItem({
			status: "published",
			slug: "test",
			data: { title: "Test", body: [], metadata: {} },
		});

		const hook = plugin.default.hooks["content:afterSave"];
		await expect(
			hook.handler({ content, collection: "posts", isNew: false }, noContentCtx),
		).resolves.toBeUndefined();

		expect(noContentCtx.log.error).toHaveBeenCalledWith(
			expect.stringContaining("content capability unavailable"),
		);
	});

	it("works across different collections", async () => {
		for (const collection of ["posts", "pages", "articles"]) {
			(ctx.content!.update as ReturnType<typeof vi.fn>).mockClear();

			const content = makeContentItem({
				status: "published",
				slug: "test-item",
				data: { title: `Test in ${collection}`, body: [], metadata: {} },
			});

			ctx.content!.get = vi.fn().mockResolvedValue({
				id: content.id,
				type: collection,
				slug: "test-item",
				status: "published",
				data: { title: `Test in ${collection}`, body: [], metadata: {} },
				createdAt: content.createdAt,
				updatedAt: content.updatedAt,
			});

			await runAfterSave(content, collection);

			const updateCall = (ctx.content!.update as ReturnType<typeof vi.fn>).mock.calls[0];
			expect(updateCall[0]).toBe(collection);

			// URL should contain the collection in the path
			const shareUrls = updateCall[2].metadata.shareUrls;
			expect(shareUrls.linkedin).toContain(encodeURIComponent(`/${collection}/test-item`));
		}
	});
});
