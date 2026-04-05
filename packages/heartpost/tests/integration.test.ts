import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeContext } from "@plugdash/testing";

// ── Full lifecycle integration tests ──
// These test the plugin through its public surface (hooks + routes)
// in sequence, simulating a real usage flow.

describe("heartpost lifecycle", () => {
	let ctx: ReturnType<typeof makeContext>;
	let kvStore: Map<string, unknown>;

	beforeEach(() => {
		kvStore = new Map();
		ctx = makeContext();

		// Wire up KV to an in-memory map for realistic get/set behaviour
		ctx.kv.get = vi.fn().mockImplementation((key: string) => {
			const val = kvStore.get(key) ?? null;
			return Promise.resolve(val);
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
			for (const [k, v] of kvStore) {
				if (!prefix || k.startsWith(prefix)) {
					entries.push({ key: k, value: v });
				}
			}
			return Promise.resolve(entries);
		});
	});

	async function getPlugin() {
		return import("../src/sandbox-entry.ts");
	}

	async function runInstall() {
		const plugin = await getPlugin();
		const hook = plugin.default.hooks!["plugin:install"];
		await hook.handler({}, ctx);
	}

	async function runAfterSave(
		contentId: string,
		collection: string,
		status = "published",
	) {
		const plugin = await getPlugin();
		const hook = plugin.default.hooks!["content:afterSave"];
		const event = {
			content: {
				id: contentId,
				status,
				slug: "test-post",
				data: { body: [], metadata: {} },
				createdAt: "2026-01-01T00:00:00Z",
				updatedAt: "2026-01-01T00:00:00Z",
				publishedAt: "2026-01-01T00:00:00Z",
			},
			collection,
			isNew: false,
		};
		await hook.handler(event, ctx);
	}

	async function postHeart(id: string, ip: string, ua: string) {
		const plugin = await getPlugin();
		const route = plugin.default.routes!.heart;
		const routeCtx = {
			input: { id },
			request: new Request(
				"https://example.com/_emdash/api/plugins/heartpost/heart",
				{
					method: "POST",
					headers: { "x-forwarded-for": ip, "user-agent": ua },
				},
			),
		};
		return route.handler(routeCtx, ctx);
	}

	async function postHeartRemove(id: string, ip: string, ua: string) {
		const plugin = await getPlugin();
		const route = plugin.default.routes!["heart-remove"];
		const routeCtx = {
			input: { id },
			request: new Request(
				"https://example.com/_emdash/api/plugins/heartpost/heart-remove",
				{
					method: "POST",
					headers: { "x-forwarded-for": ip, "user-agent": ua },
				},
			),
		};
		return route.handler(routeCtx, ctx);
	}

	async function getHeartStatus(id: string, ip: string, ua: string) {
		const plugin = await getPlugin();
		const route = plugin.default.routes!["heart-status"];
		const routeCtx = {
			input: undefined,
			request: new Request(
				`https://example.com/_emdash/api/plugins/heartpost/heart-status?id=${id}`,
				{
					headers: { "x-forwarded-for": ip, "user-agent": ua },
				},
			),
		};
		return route.handler(routeCtx, ctx);
	}

	it("install seeds default config", async () => {
		await runInstall();

		expect(kvStore.get("config:label")).toBe("hearts");
		expect(kvStore.get("config:collections")).toBe(null);
	});

	it("publish initialises count, heart increments, status reflects state", async () => {
		await runInstall();

		// Publish a post - should init count to 0
		await runAfterSave("post-1", "posts");
		expect(kvStore.get("heartpost:post-1:count")).toBe(0);

		// Check status before any hearts
		const before = await getHeartStatus("post-1", "10.0.0.1", "Chrome");
		expect(before).toEqual({ count: 0, hearted: false });

		// First heart from user A
		const heartA = await postHeart("post-1", "10.0.0.1", "Chrome");
		expect(heartA).toEqual({ count: 1, hearted: true });

		// Status should reflect the heart
		const afterA = await getHeartStatus("post-1", "10.0.0.1", "Chrome");
		expect(afterA).toEqual({ count: 1, hearted: true });

		// Second heart from user B (different IP)
		const heartB = await postHeart("post-1", "10.0.0.2", "Firefox");
		expect(heartB).toEqual({ count: 2, hearted: true });

		// User B sees hearted: true, user A still sees hearted: true
		const statusB = await getHeartStatus("post-1", "10.0.0.2", "Firefox");
		expect(statusB).toEqual({ count: 2, hearted: true });
		const statusA = await getHeartStatus("post-1", "10.0.0.1", "Chrome");
		expect(statusA).toEqual({ count: 2, hearted: true });
	});

	it("duplicate heart from same fingerprint does not increment", async () => {
		await runInstall();
		await runAfterSave("post-2", "posts");

		// Heart once
		const first = await postHeart("post-2", "10.0.0.1", "Chrome");
		expect(first.count).toBe(1);

		// Heart again - same user
		const second = await postHeart("post-2", "10.0.0.1", "Chrome");
		expect(second.count).toBe(1);
		expect(second.hearted).toBe(true);

		// Count in KV should still be 1
		expect(kvStore.get("heartpost:post-2:count")).toBe(1);
	});

	it("re-publish does not reset existing heart count", async () => {
		await runInstall();
		await runAfterSave("post-3", "posts");

		// Accumulate some hearts
		await postHeart("post-3", "10.0.0.1", "Chrome");
		await postHeart("post-3", "10.0.0.2", "Firefox");
		await postHeart("post-3", "10.0.0.3", "Safari");
		expect(kvStore.get("heartpost:post-3:count")).toBe(3);

		// Re-publish the same content
		await runAfterSave("post-3", "posts");

		// Count must still be 3
		expect(kvStore.get("heartpost:post-3:count")).toBe(3);
	});

	it("draft content does not get count initialised", async () => {
		await runInstall();
		await runAfterSave("draft-1", "posts", "draft");

		expect(kvStore.has("heartpost:draft-1:count")).toBe(false);
	});

	it("collections allowlist is respected", async () => {
		await runInstall();
		// Override config to only allow "articles"
		kvStore.set("config:collections", ["articles"]);

		await runAfterSave("post-4", "posts");
		expect(kvStore.has("heartpost:post-4:count")).toBe(false);

		await runAfterSave("article-1", "articles");
		expect(kvStore.get("heartpost:article-1:count")).toBe(0);
	});

	it("heart route works even without prior afterSave (count starts at 0)", async () => {
		// No install, no afterSave - just hit the route directly
		// This simulates hearting content that was published before the plugin was installed
		const result = await postHeart("orphan-1", "10.0.0.1", "Chrome");
		expect(result).toEqual({ count: 1, hearted: true });
	});

	it("heart-remove decrements count and clears fingerprint", async () => {
		await runInstall();
		await runAfterSave("post-r", "posts");

		// Heart, then unheart - same user
		const hearted = await postHeart("post-r", "10.0.0.1", "Chrome");
		expect(hearted).toEqual({ count: 1, hearted: true });

		const removed = await postHeartRemove("post-r", "10.0.0.1", "Chrome");
		expect(removed).toEqual({ count: 0, hearted: false });

		// Status should now show not hearted
		const status = await getHeartStatus("post-r", "10.0.0.1", "Chrome");
		expect(status).toEqual({ count: 0, hearted: false });
	});

	it("heart-remove on non-hearted post is a no-op", async () => {
		await runInstall();
		await runAfterSave("post-n", "posts");

		const result = await postHeartRemove("post-n", "10.0.0.1", "Chrome");
		expect(result).toEqual({ count: 0, hearted: false });
		expect(kvStore.get("heartpost:post-n:count")).toBe(0);
	});

	it("heart-remove clamps at 0, never negative", async () => {
		await runInstall();
		await runAfterSave("post-z", "posts");

		await postHeart("post-z", "10.0.0.1", "Chrome");
		await postHeartRemove("post-z", "10.0.0.1", "Chrome");
		// Second remove - already at 0, fingerprint gone
		const result = await postHeartRemove("post-z", "10.0.0.1", "Chrome");
		expect(result.count).toBe(0);
		expect(result.hearted).toBe(false);
	});

	it("heart-remove only removes for the caller's fingerprint", async () => {
		await runInstall();
		await runAfterSave("post-m", "posts");

		await postHeart("post-m", "10.0.0.1", "Chrome");
		await postHeart("post-m", "10.0.0.2", "Firefox");
		expect(kvStore.get("heartpost:post-m:count")).toBe(2);

		const removed = await postHeartRemove("post-m", "10.0.0.1", "Chrome");
		expect(removed).toEqual({ count: 1, hearted: false });

		// User B still hearted
		const statusB = await getHeartStatus("post-m", "10.0.0.2", "Firefox");
		expect(statusB).toEqual({ count: 1, hearted: true });
	});

	it("heart-remove without id returns error", async () => {
		const plugin = await getPlugin();
		const route = plugin.default.routes!["heart-remove"];
		const result = await route.handler(
			{
				input: {},
				request: new Request(
					"https://example.com/_emdash/api/plugins/heartpost/heart-remove",
					{ method: "POST" },
				),
			},
			ctx,
		);
		expect(result).toEqual({ error: "missing_id" });
	});

	it("multiple posts track counts independently", async () => {
		await runInstall();
		await runAfterSave("a", "posts");
		await runAfterSave("b", "posts");

		await postHeart("a", "10.0.0.1", "Chrome");
		await postHeart("a", "10.0.0.2", "Firefox");
		await postHeart("b", "10.0.0.1", "Chrome");

		expect(kvStore.get("heartpost:a:count")).toBe(2);
		expect(kvStore.get("heartpost:b:count")).toBe(1);

		const statusA = await getHeartStatus("a", "10.0.0.3", "Safari");
		expect(statusA).toEqual({ count: 2, hearted: false });

		const statusB = await getHeartStatus("b", "10.0.0.1", "Chrome");
		expect(statusB).toEqual({ count: 1, hearted: true });
	});
});
