import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeContext, makeContentItem } from "@plugdash/testing";

// Integration tests for the shortlink plugin.
// These test the full plugin lifecycle against a mocked EmDash context.
// A real EmDashTestClient testbed is not available, so we use comprehensive
// mocks that simulate the host's behavior faithfully.

describe("shortlink integration", () => {
	let ctx: ReturnType<typeof makeContext>;
	const kvStore: Map<string, unknown> = new Map();

	beforeEach(() => {
		kvStore.clear();
		ctx = makeContext();

		// Simulate a real KV store backed by a Map
		ctx.kv.get = vi.fn().mockImplementation((key: string) => {
			return Promise.resolve(kvStore.get(key) ?? null);
		});
		ctx.kv.set = vi.fn().mockImplementation((key: string, value: unknown) => {
			kvStore.set(key, value);
			return Promise.resolve();
		});
		ctx.kv.delete = vi.fn().mockImplementation((key: string) => {
			kvStore.delete(key);
			return Promise.resolve();
		});
		ctx.kv.list = vi.fn().mockImplementation((prefix?: string) => {
			const entries: Array<{ key: string; value: unknown }> = [];
			for (const [key, value] of kvStore.entries()) {
				if (!prefix || key.startsWith(prefix)) {
					entries.push({ key, value });
				}
			}
			return Promise.resolve(entries);
		});
	});

	async function runInstall() {
		const plugin = await import("../src/sandbox-entry.ts");
		const hook = plugin.default.hooks["plugin:install"];
		await hook.handler({}, ctx);
	}

	async function runAfterSave(
		content: Record<string, unknown>,
		collection = "posts",
	) {
		const plugin = await import("../src/sandbox-entry.ts");
		const hook = plugin.default.hooks["content:afterSave"];
		await hook.handler({ content, collection, isNew: false }, ctx);
	}

	async function callResolve(code: string) {
		const plugin = await import("../src/sandbox-entry.ts");
		const route = plugin.default.routes!.resolve;
		const routeCtx = {
			input: undefined,
			request: new Request(
				`https://example.com/_emdash/api/plugins/shortlink/resolve?code=${code}`,
			),
		};
		return route.handler(routeCtx, ctx);
	}

	async function callAdmin(interaction?: Record<string, unknown>) {
		const plugin = await import("../src/sandbox-entry.ts");
		const route = plugin.default.routes!.admin;
		const routeCtx = {
			input: interaction ?? { type: "page_load", page: "/shortlinks" },
			request: new Request(
				"https://example.com/_emdash/api/plugins/shortlink/admin",
			),
		};
		return route.handler(routeCtx, ctx);
	}

	// ── Full lifecycle: install -> publish -> resolve ──

	it("install seeds default config, publish creates shortlink, resolve returns target", async () => {
		// Step 1: Install
		await runInstall();
		expect(kvStore.get("config:prefix")).toBe("/s/");
		expect(kvStore.get("config:codeLength")).toBe(4);
		expect(kvStore.get("config:autoCreate")).toBe(true);

		// Step 2: Publish a post
		const content = makeContentItem({
			id: "post-abc",
			status: "published",
			slug: "hello-world",
			data: { body: [], metadata: {} },
		});

		ctx.content!.get = vi.fn().mockResolvedValue({
			id: "post-abc",
			type: "posts",
			slug: "hello-world",
			status: "published",
			data: { body: [], metadata: {} },
			createdAt: content.createdAt,
			updatedAt: content.updatedAt,
		});

		await runAfterSave(content, "posts");

		// Verify metadata was written
		expect(ctx.content!.update).toHaveBeenCalledOnce();
		const updateData = (ctx.content!.update as ReturnType<typeof vi.fn>)
			.mock.calls[0][2];
		const shortlink = updateData.metadata.shortlink;
		expect(shortlink.code).toMatch(/^[a-zA-Z0-9]{4}$/);
		expect(shortlink.url).toBe(`/s/${shortlink.code}`);
		expect(shortlink.fullUrl).toBe(
			`https://example.com/s/${shortlink.code}`,
		);

		// Step 3: Resolve the shortlink
		const result = await callResolve(shortlink.code);
		expect(result).toEqual(
			expect.objectContaining({
				target: "/posts/hello-world",
				code: shortlink.code,
			}),
		);
	});

	it("draft save does not create shortlink", async () => {
		await runInstall();

		const content = makeContentItem({
			status: "draft",
			slug: "draft-post",
			data: { body: [], metadata: {} },
		});

		await runAfterSave(content, "posts");
		expect(ctx.content!.update).not.toHaveBeenCalled();

		// No shortlink keys in KV (only config keys)
		const shortlinkKeys = [...kvStore.keys()].filter(
			(k) => k.startsWith("shortlink:"),
		);
		expect(shortlinkKeys).toHaveLength(0);
	});

	it("re-publish does not create duplicate shortlink", async () => {
		await runInstall();

		const content = makeContentItem({
			id: "post-dup",
			status: "published",
			slug: "same-post",
			data: { body: [], metadata: {} },
		});

		ctx.content!.get = vi.fn().mockResolvedValue({
			id: "post-dup",
			type: "posts",
			slug: "same-post",
			status: "published",
			data: { body: [], metadata: {} },
			createdAt: content.createdAt,
			updatedAt: content.updatedAt,
		});

		// First publish
		await runAfterSave(content, "posts");
		expect(ctx.content!.update).toHaveBeenCalledOnce();
		const firstCode = (ctx.content!.update as ReturnType<typeof vi.fn>)
			.mock.calls[0][2].metadata.shortlink.code;

		// Reset update mock
		(ctx.content!.update as ReturnType<typeof vi.fn>).mockClear();

		// Second publish - should skip because reverse index exists
		await runAfterSave(content, "posts");
		expect(ctx.content!.update).not.toHaveBeenCalled();

		// Reverse index still points to original code
		expect(kvStore.get("shortlink:by-content:post-dup")).toBe(firstCode);
	});

	it("preserves existing metadata from other plugins during shortlink creation", async () => {
		await runInstall();

		const content = makeContentItem({
			id: "post-meta",
			status: "published",
			slug: "meta-post",
			data: {
				body: [],
				metadata: { readingTimeMinutes: 3, wordCount: 500, author: "Jane" },
			},
		});

		ctx.content!.get = vi.fn().mockResolvedValue({
			id: "post-meta",
			type: "posts",
			slug: "meta-post",
			status: "published",
			data: {
				body: [],
				metadata: { readingTimeMinutes: 3, wordCount: 500, author: "Jane" },
			},
			createdAt: content.createdAt,
			updatedAt: content.updatedAt,
		});

		await runAfterSave(content, "posts");

		const updateData = (ctx.content!.update as ReturnType<typeof vi.fn>)
			.mock.calls[0][2];
		expect(updateData.metadata.readingTimeMinutes).toBe(3);
		expect(updateData.metadata.wordCount).toBe(500);
		expect(updateData.metadata.author).toBe("Jane");
		expect(updateData.metadata.shortlink).toBeDefined();
	});

	// ── Resolve edge cases ──

	it("resolve returns not_found for unknown code", async () => {
		const result = await callResolve("nope");
		expect(result).toEqual(
			expect.objectContaining({ error: "not_found" }),
		);
	});

	it("resolve returns expired for link past expiresAt", async () => {
		kvStore.set("shortlink:old1", {
			code: "old1",
			target: "/posts/expired-post",
			contentId: "post-expired",
			collection: "posts",
			createdAt: "2025-01-01T00:00:00Z",
			expiresAt: "2025-06-01T00:00:00Z",
			custom: false,
		});

		const result = await callResolve("old1");
		expect(result).toEqual(
			expect.objectContaining({ expired: true }),
		);
	});

	// ── Custom shortlink via admin ──

	it("create custom shortlink via admin, then resolve it", async () => {
		await runInstall();

		// Create custom shortlink
		const createResult = await callAdmin({
			type: "form_submit",
			action_id: "create_shortlink",
			values: { code: "launch", target: "/announcements/v1" },
		});

		expect(createResult).toEqual(
			expect.objectContaining({
				toast: expect.objectContaining({ type: "success" }),
			}),
		);

		// Resolve it
		const result = await callResolve("launch");
		expect(result).toEqual(
			expect.objectContaining({
				target: "/announcements/v1",
				code: "launch",
			}),
		);
	});

	it("delete shortlink via admin removes it from KV", async () => {
		await runInstall();

		// Create a shortlink first
		kvStore.set("shortlink:delme", {
			code: "delme",
			target: "/posts/to-delete",
			contentId: "post-del",
			collection: "posts",
			createdAt: "2026-01-01T00:00:00Z",
			custom: false,
		});
		kvStore.set("shortlink:by-content:post-del", "delme");

		// Delete via admin
		await callAdmin({
			type: "button_click",
			action_id: "delete_shortlink:delme",
		});

		// KV should be cleaned up
		expect(kvStore.has("shortlink:delme")).toBe(false);
		expect(kvStore.has("shortlink:by-content:post-del")).toBe(false);

		// Resolve should return not_found
		const result = await callResolve("delme");
		expect(result).toEqual(
			expect.objectContaining({ error: "not_found" }),
		);
	});

	// ── Admin page rendering ──

	it("admin page_load returns blocks with stats, settings form, table, and create form", async () => {
		await runInstall();

		// Seed a shortlink so the table has data
		kvStore.set("shortlink:test1", {
			code: "test1",
			target: "/posts/hello",
			contentId: "post-1",
			collection: "posts",
			createdAt: "2026-01-01T00:00:00Z",
			custom: false,
		});

		const result = await callAdmin();
		const blocks = (result as Record<string, unknown>).blocks as unknown[];
		expect(blocks).toBeDefined();
		expect(blocks.length).toBeGreaterThan(0);

		// Check block types present
		const types = (blocks as Array<{ type: string }>).map((b) => b.type);
		expect(types).toContain("header");
		expect(types).toContain("stats");
		expect(types).toContain("form");
		expect(types).toContain("table");
	});

	it("admin save_settings updates KV config", async () => {
		await runInstall();

		await callAdmin({
			type: "form_submit",
			action_id: "save_settings",
			values: {
				prefix: "/l/",
				codeLength: 6,
				autoCreate: false,
				domain: "https://short.me",
			},
		});

		expect(kvStore.get("config:prefix")).toBe("/l/");
		expect(kvStore.get("config:codeLength")).toBe(6);
		expect(kvStore.get("config:autoCreate")).toBe(false);
		expect(kvStore.get("config:domain")).toBe("https://short.me");
	});
});
