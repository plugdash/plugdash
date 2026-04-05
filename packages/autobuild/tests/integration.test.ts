import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { makeContext, makeContentItem } from "@plugdash/testing";
import { autobuildPlugin } from "../src/index.ts";

// Integration tests for the autobuild plugin.
// These cover the full lifecycle: install -> seed KV -> hook fires ->
// debounce -> webhook POST. The EmDash testbed is not running, so we
// simulate the host with a real KV backed by a Map and a mock fetch.

function makeKv() {
	const store = new Map<string, unknown>();
	return {
		store,
		kv: {
			get: vi.fn((key: string) => {
				return Promise.resolve(store.get(key) ?? null);
			}) as unknown as <T>(key: string) => Promise<T | null>,
			set: vi.fn(async (key: string, value: unknown) => {
				store.set(key, value);
			}),
			delete: vi.fn(async (key: string) => {
				store.delete(key);
			}),
			list: vi.fn(async () => []),
		},
	};
}

describe("autobuild integration", () => {
	let ctx: ReturnType<typeof makeContext>;
	let fetchMock: ReturnType<typeof vi.fn>;
	let kvBacking: ReturnType<typeof makeKv>;
	let webhookReceiver: Array<{ url: string; init: RequestInit }>;

	beforeEach(() => {
		vi.useFakeTimers();
		webhookReceiver = [];
		fetchMock = vi.fn(async (url: string, init: RequestInit) => {
			webhookReceiver.push({ url, init });
			return new Response("ok", { status: 200 });
		});
		kvBacking = makeKv();
		ctx = makeContext({
			http: { fetch: fetchMock },
			kv: kvBacking.kv,
		});
		(globalThis as Record<string, unknown>).__plugdash_autobuild_config__ =
			undefined;
	});

	afterEach(() => {
		vi.useRealTimers();
		(globalThis as Record<string, unknown>).__plugdash_autobuild_config__ =
			undefined;
	});

	async function installAndGetHooks() {
		// Build descriptor (this sets globalThis bootstrap)
		const descriptor = autobuildPlugin({
			hookUrl: "https://api.cloudflare.com/client/v4/pages/deploy/abc",
			debounceMs: 50,
			collections: ["posts"],
		});
		expect(descriptor.capabilities).toContain("network:fetch");
		expect(descriptor.capabilities).toContain("read:content");
		expect(descriptor.allowedHosts).toEqual(["api.cloudflare.com"]);

		// Run plugin:install to seed KV
		const plugin = await import("../src/sandbox-entry.ts");
		await plugin.default.hooks!["plugin:install"].handler({}, ctx);
		return plugin.default.hooks!;
	}

	it("install seeds KV and a published post triggers one webhook POST", async () => {
		const hooks = await installAndGetHooks();
		// KV should now have the bootstrap config
		expect(kvBacking.store.get("autobuild:config:hookUrl")).toBe(
			"https://api.cloudflare.com/client/v4/pages/deploy/abc",
		);
		expect(kvBacking.store.get("autobuild:config:debounceMs")).toBe(50);

		const content = makeContentItem({ status: "published" });
		await hooks["content:afterSave"]!.handler(
			{ content, collection: "posts", isNew: false },
			ctx,
		);
		expect(webhookReceiver).toHaveLength(0); // debounced
		await vi.advanceTimersByTimeAsync(60);
		expect(webhookReceiver).toHaveLength(1);
		expect(webhookReceiver[0]!.url).toBe(
			"https://api.cloudflare.com/client/v4/pages/deploy/abc",
		);
		expect(webhookReceiver[0]!.init.method).toBe("POST");
	});

	it("three rapid publishes coalesce into exactly one webhook POST", async () => {
		const hooks = await installAndGetHooks();
		const c1 = makeContentItem({ id: "a", status: "published" });
		const c2 = makeContentItem({ id: "b", status: "published" });
		const c3 = makeContentItem({ id: "c", status: "published" });

		await hooks["content:afterSave"]!.handler(
			{ content: c1, collection: "posts", isNew: false },
			ctx,
		);
		await vi.advanceTimersByTimeAsync(10);
		await hooks["content:afterSave"]!.handler(
			{ content: c2, collection: "posts", isNew: false },
			ctx,
		);
		await vi.advanceTimersByTimeAsync(10);
		await hooks["content:afterSave"]!.handler(
			{ content: c3, collection: "posts", isNew: false },
			ctx,
		);
		await vi.advanceTimersByTimeAsync(60);
		expect(webhookReceiver).toHaveLength(1);
	});

	it("delete of any collection item fires a webhook (no status filter)", async () => {
		const hooks = await installAndGetHooks();
		await hooks["content:afterDelete"]!.handler(
			{ id: "deleted-1", collection: "posts" },
			ctx,
		);
		await vi.advanceTimersByTimeAsync(60);
		expect(webhookReceiver).toHaveLength(1);
	});

	it("collection filter skips posts outside the allowlist", async () => {
		const hooks = await installAndGetHooks();
		const content = makeContentItem({ status: "published" });
		await hooks["content:afterSave"]!.handler(
			{ content, collection: "comments", isNew: false },
			ctx,
		);
		await vi.advanceTimersByTimeAsync(100);
		expect(webhookReceiver).toHaveLength(0);
	});

	it("hook URL returning 500 logs error, handler still resolves", async () => {
		fetchMock.mockImplementation(async () => new Response("err", { status: 500 }));
		const hooks = await installAndGetHooks();
		const content = makeContentItem({ status: "published" });
		await expect(
			hooks["content:afterSave"]!.handler(
				{ content, collection: "posts", isNew: false },
				ctx,
			),
		).resolves.toBeUndefined();
		await vi.advanceTimersByTimeAsync(60);
		await Promise.resolve();
		await Promise.resolve();
		expect(ctx.log.error).toHaveBeenCalled();
	});

	it("private-IP hookUrl is rejected before fetch is called", async () => {
		// Override after install to simulate misconfiguration via admin UI
		const hooks = await installAndGetHooks();
		kvBacking.store.set("autobuild:config:hookUrl", "https://10.0.0.5/deploy");
		// Also change global so reseed triggers with the bad URL
		(globalThis as Record<string, unknown>).__plugdash_autobuild_config__ = {
			hookUrl: "https://10.0.0.5/deploy",
			debounceMs: 50,
			collections: ["posts"],
		};
		kvBacking.store.set("autobuild:bootstrapHash", "stale");

		const content = makeContentItem({ status: "published" });
		await hooks["content:afterSave"]!.handler(
			{ content, collection: "posts", isNew: false },
			ctx,
		);
		await vi.advanceTimersByTimeAsync(60);
		await Promise.resolve();
		await Promise.resolve();
		expect(webhookReceiver).toHaveLength(0);
		expect(ctx.log.error).toHaveBeenCalled();
	});

	it("missing hookUrl config no-ops with warning logged on install", async () => {
		// Build descriptor with empty hookUrl
		autobuildPlugin({ hookUrl: "", debounceMs: 50 });
		const plugin = await import("../src/sandbox-entry.ts");
		await plugin.default.hooks!["plugin:install"].handler({}, ctx);
		expect(ctx.log.warn).toHaveBeenCalled();

		// Subsequent afterSave is a no-op
		const content = makeContentItem({ status: "published" });
		await plugin.default.hooks!["content:afterSave"].handler(
			{ content, collection: "posts", isNew: false },
			ctx,
		);
		await vi.advanceTimersByTimeAsync(100);
		expect(webhookReceiver).toHaveLength(0);
	});

	it("draft content does not trigger a webhook", async () => {
		const hooks = await installAndGetHooks();
		const draft = makeContentItem({ status: "draft" });
		await hooks["content:afterSave"]!.handler(
			{ content: draft, collection: "posts", isNew: false },
			ctx,
		);
		await vi.advanceTimersByTimeAsync(100);
		expect(webhookReceiver).toHaveLength(0);
	});

	it("descriptor includes explicit allowedHosts override when provided", () => {
		const descriptor = autobuildPlugin({
			hookUrl: "https://api.cloudflare.com/hook",
			allowedHosts: ["deploy.example.com", "cdn.example.com"],
		});
		expect(descriptor.allowedHosts).toEqual([
			"deploy.example.com",
			"cdn.example.com",
		]);
	});
});
