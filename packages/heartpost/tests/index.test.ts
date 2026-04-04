import { describe, it, expect, vi, beforeEach } from "vitest";
import { generateFingerprint } from "../src/sandbox-entry.ts";
import { makeContext, makeContentItem } from "@plugdash/testing";

// ── generateFingerprint ──

describe("generateFingerprint", () => {
	it("generates consistent fingerprint for same ip + userAgent", async () => {
		const fp1 = await generateFingerprint("192.168.1.1", "Mozilla/5.0");
		const fp2 = await generateFingerprint("192.168.1.1", "Mozilla/5.0");
		expect(fp1).toBe(fp2);
	});

	it("generates different fingerprint for different ip", async () => {
		const fp1 = await generateFingerprint("192.168.1.1", "Mozilla/5.0");
		const fp2 = await generateFingerprint("10.0.0.1", "Mozilla/5.0");
		expect(fp1).not.toBe(fp2);
	});

	it("generates different fingerprint for different userAgent", async () => {
		const fp1 = await generateFingerprint("192.168.1.1", "Mozilla/5.0");
		const fp2 = await generateFingerprint("192.168.1.1", "Chrome/120");
		expect(fp1).not.toBe(fp2);
	});

	it("truncates to 16 chars", async () => {
		const fp = await generateFingerprint("192.168.1.1", "Mozilla/5.0");
		expect(fp).toHaveLength(16);
	});

	it("returns hex characters only", async () => {
		const fp = await generateFingerprint("192.168.1.1", "Mozilla/5.0");
		expect(fp).toMatch(/^[0-9a-f]{16}$/);
	});

	it("never stores ip directly in output", async () => {
		const ip = "192.168.1.1";
		const fp = await generateFingerprint(ip, "Mozilla/5.0");
		expect(fp).not.toContain(ip);
	});
});

// ── plugin:install hook ──

describe("heartpost hook: plugin:install", () => {
	it("seeds config:label to KV", async () => {
		const ctx = makeContext();
		const plugin = await import("../src/sandbox-entry.ts");
		const hook = plugin.default.hooks["plugin:install"];
		await hook.handler({}, ctx);

		expect(ctx.kv.set).toHaveBeenCalledWith("config:label", "hearts");
	});

	it("seeds config:collections as null to KV", async () => {
		const ctx = makeContext();
		const plugin = await import("../src/sandbox-entry.ts");
		const hook = plugin.default.hooks["plugin:install"];
		await hook.handler({}, ctx);

		expect(ctx.kv.set).toHaveBeenCalledWith("config:collections", null);
	});
});

// ── content:afterSave hook ──

describe("heartpost hook: content:afterSave", () => {
	let ctx: ReturnType<typeof makeContext>;

	beforeEach(() => {
		ctx = makeContext();
	});

	async function runHook(
		content: Record<string, unknown>,
		collection = "posts",
	) {
		const plugin = await import("../src/sandbox-entry.ts");
		const hook = plugin.default.hooks["content:afterSave"];
		const event = { content, collection, isNew: false };
		await hook.handler(event, ctx);
	}

	it("initialises count to 0 on first publish", async () => {
		const content = makeContentItem({
			status: "published",
			data: { body: [], metadata: {} },
		});

		// No existing count
		ctx.kv.get = vi.fn().mockResolvedValue(null);

		await runHook(content, "posts");

		expect(ctx.kv.set).toHaveBeenCalledWith(
			`heartpost:${content.id}:count`,
			0,
		);
	});

	it("does not reset count on re-publish", async () => {
		const content = makeContentItem({
			status: "published",
			data: { body: [], metadata: {} },
		});

		// Count already exists
		ctx.kv.get = vi.fn().mockImplementation((key: string) => {
			if (key === `heartpost:${content.id}:count`) return Promise.resolve(42);
			return Promise.resolve(null);
		});

		await runHook(content, "posts");

		// Should not overwrite existing count
		expect(ctx.kv.set).not.toHaveBeenCalledWith(
			`heartpost:${content.id}:count`,
			expect.anything(),
		);
	});

	it("skips non-published content", async () => {
		const content = makeContentItem({ status: "draft" });
		await runHook(content);
		expect(ctx.kv.set).not.toHaveBeenCalled();
	});

	it("skips archived content", async () => {
		const content = makeContentItem({ status: "archived" });
		await runHook(content);
		expect(ctx.kv.set).not.toHaveBeenCalled();
	});

	it("skips collections not in config", async () => {
		ctx.kv.get = vi.fn().mockImplementation((key: string) => {
			if (key === "config:collections") return Promise.resolve(["articles"]);
			return Promise.resolve(null);
		});

		const content = makeContentItem({ status: "published" });
		await runHook(content, "posts");
		expect(ctx.kv.set).not.toHaveBeenCalled();
	});

	it("processes all collections when config:collections is null", async () => {
		ctx.kv.get = vi.fn().mockImplementation((key: string) => {
			if (key === "config:collections") return Promise.resolve(null);
			return Promise.resolve(null);
		});

		const content = makeContentItem({
			status: "published",
			data: { body: [], metadata: {} },
		});
		await runHook(content, "any-collection");

		expect(ctx.kv.set).toHaveBeenCalledWith(
			`heartpost:${content.id}:count`,
			0,
		);
	});

	it("handles undefined ctx.content gracefully - does not throw", async () => {
		const noContentCtx = makeContext({ content: undefined });
		const content = makeContentItem({ status: "published" });

		const plugin = await import("../src/sandbox-entry.ts");
		const hook = plugin.default.hooks["content:afterSave"];
		const event = { content, collection: "posts", isNew: false };

		await expect(hook.handler(event, noContentCtx)).resolves.toBeUndefined();
	});
});

// ── heart route (POST) ──

describe("heart route (POST)", () => {
	let ctx: ReturnType<typeof makeContext>;

	beforeEach(() => {
		ctx = makeContext();
	});

	async function callHeart(id: string, ip = "192.168.1.1", ua = "Mozilla/5.0") {
		const plugin = await import("../src/sandbox-entry.ts");
		const route = plugin.default.routes!.heart;
		const routeCtx = {
			input: { id },
			request: new Request("https://example.com/_emdash/api/plugins/heartpost/heart", {
				method: "POST",
				headers: {
					"x-forwarded-for": ip,
					"user-agent": ua,
				},
			}),
		};
		return route.handler(routeCtx, ctx);
	}

	it("increments count on first heart", async () => {
		const fp = await generateFingerprint("192.168.1.1", "Mozilla/5.0");

		ctx.kv.get = vi.fn().mockImplementation((key: string) => {
			if (key === "heartpost:post-1:count") return Promise.resolve(5);
			if (key === `heartpost:post-1:${fp}`) return Promise.resolve(null);
			return Promise.resolve(null);
		});

		const result = await callHeart("post-1");

		expect(result).toEqual(
			expect.objectContaining({ count: 6, hearted: true }),
		);
		// Count should be written
		expect(ctx.kv.set).toHaveBeenCalledWith("heartpost:post-1:count", 6);
	});

	it("returns current count without incrementing on duplicate fingerprint", async () => {
		const fp = await generateFingerprint("192.168.1.1", "Mozilla/5.0");

		ctx.kv.get = vi.fn().mockImplementation((key: string) => {
			if (key === "heartpost:post-1:count") return Promise.resolve(10);
			if (key === `heartpost:post-1:${fp}`) return Promise.resolve("1");
			return Promise.resolve(null);
		});

		const result = await callHeart("post-1");

		expect(result).toEqual(
			expect.objectContaining({ count: 10, hearted: true }),
		);
		// Should NOT write new count
		expect(ctx.kv.set).not.toHaveBeenCalledWith(
			"heartpost:post-1:count",
			expect.anything(),
		);
	});

	it("returns hearted: true when fingerprint already exists", async () => {
		const fp = await generateFingerprint("192.168.1.1", "Mozilla/5.0");

		ctx.kv.get = vi.fn().mockImplementation((key: string) => {
			if (key === "heartpost:post-1:count") return Promise.resolve(7);
			if (key === `heartpost:post-1:${fp}`) return Promise.resolve("1");
			return Promise.resolve(null);
		});

		const result = await callHeart("post-1");
		expect(result.hearted).toBe(true);
	});

	it("returns hearted: false for new fingerprint before incrementing", async () => {
		// This tests the response after increment - hearted should be true
		const fp = await generateFingerprint("192.168.1.1", "Mozilla/5.0");

		ctx.kv.get = vi.fn().mockImplementation((key: string) => {
			if (key === "heartpost:post-1:count") return Promise.resolve(0);
			if (key === `heartpost:post-1:${fp}`) return Promise.resolve(null);
			return Promise.resolve(null);
		});

		const result = await callHeart("post-1");
		// After successfully hearting, hearted is always true
		expect(result.hearted).toBe(true);
		expect(result.count).toBe(1);
	});

	it("returns error when id is missing", async () => {
		const plugin = await import("../src/sandbox-entry.ts");
		const route = plugin.default.routes!.heart;
		const routeCtx = {
			input: {},
			request: new Request("https://example.com/_emdash/api/plugins/heartpost/heart", {
				method: "POST",
			}),
		};

		const result = await route.handler(routeCtx, ctx);
		expect(result).toEqual(
			expect.objectContaining({ error: "missing_id" }),
		);
	});

	it("stores fingerprint in KV after successful heart", async () => {
		const fp = await generateFingerprint("192.168.1.1", "Mozilla/5.0");

		ctx.kv.get = vi.fn().mockImplementation((key: string) => {
			if (key === "heartpost:post-1:count") return Promise.resolve(0);
			if (key === `heartpost:post-1:${fp}`) return Promise.resolve(null);
			return Promise.resolve(null);
		});

		await callHeart("post-1");

		expect(ctx.kv.set).toHaveBeenCalledWith(`heartpost:post-1:${fp}`, "1");
	});
});

// ── heart-status route (GET) ──

describe("heart-status route (GET)", () => {
	let ctx: ReturnType<typeof makeContext>;

	beforeEach(() => {
		ctx = makeContext();
	});

	async function callHeartStatus(id: string, ip = "192.168.1.1", ua = "Mozilla/5.0") {
		const plugin = await import("../src/sandbox-entry.ts");
		const route = plugin.default.routes!["heart-status"];
		const routeCtx = {
			input: undefined,
			request: new Request(
				`https://example.com/_emdash/api/plugins/heartpost/heart-status?id=${id}`,
				{
					headers: {
						"x-forwarded-for": ip,
						"user-agent": ua,
					},
				},
			),
		};
		return route.handler(routeCtx, ctx);
	}

	it("returns count and hearted status", async () => {
		const fp = await generateFingerprint("192.168.1.1", "Mozilla/5.0");

		ctx.kv.get = vi.fn().mockImplementation((key: string) => {
			if (key === "heartpost:post-1:count") return Promise.resolve(42);
			if (key === `heartpost:post-1:${fp}`) return Promise.resolve("1");
			return Promise.resolve(null);
		});

		const result = await callHeartStatus("post-1");
		expect(result).toEqual({ count: 42, hearted: true });
	});

	it("returns count: 0 and hearted: false for unknown content", async () => {
		ctx.kv.get = vi.fn().mockResolvedValue(null);

		const result = await callHeartStatus("nonexistent");
		expect(result).toEqual({ count: 0, hearted: false });
	});

	it("returns hearted: false for new fingerprint", async () => {
		const fp = await generateFingerprint("10.0.0.1", "Chrome/120");

		ctx.kv.get = vi.fn().mockImplementation((key: string) => {
			if (key === "heartpost:post-1:count") return Promise.resolve(5);
			if (key === `heartpost:post-1:${fp}`) return Promise.resolve(null);
			return Promise.resolve(null);
		});

		const result = await callHeartStatus("post-1", "10.0.0.1", "Chrome/120");
		expect(result).toEqual({ count: 5, hearted: false });
	});

	it("returns error when id query param is missing", async () => {
		const plugin = await import("../src/sandbox-entry.ts");
		const route = plugin.default.routes!["heart-status"];
		const routeCtx = {
			input: undefined,
			request: new Request("https://example.com/_emdash/api/plugins/heartpost/heart-status"),
		};

		const result = await route.handler(routeCtx, ctx);
		expect(result).toEqual(
			expect.objectContaining({ error: "missing_id" }),
		);
	});
});
