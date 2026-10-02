import { describe, expect, it, vi } from "vitest";
import { callRoute, makeContext, makePost, runHook } from "../src/index";

describe("content", () => {
	const schema = { posts: ["title", "content"] };

	it("update() with an unknown field throws like EmDash", async () => {
		const ctx = makeContext({ schema, items: { posts: [{ id: "p1", data: { title: "t" } }] } });
		await expect(ctx.content!.update("posts", "p1", { metadata: { a: 1 } })).rejects.toThrow(
			"Unknown field 'metadata' in collection 'posts'",
		);
	});

	it("revisions: get() does not see an un-published update()", async () => {
		const ctx = makeContext({
			schema,
			revisions: true,
			items: { posts: [{ id: "p1", data: { title: "old" } }] },
		});
		await ctx.content!.update("posts", "p1", { title: "new" });
		expect((await ctx.content!.get("posts", "p1"))?.data.title).toBe("old");
		expect(ctx.getDraft("posts", "p1")).toEqual({ title: "new" });
		ctx.publishDraft("posts", "p1");
		expect((await ctx.content!.get("posts", "p1"))?.data.title).toBe("new");
	});

	it("without revisions update() is live", async () => {
		const ctx = makeContext({ schema, items: { posts: [{ id: "p1", data: { title: "a" } }] } });
		await ctx.content!.update("posts", "p1", { title: "b" });
		expect((await ctx.content!.get("posts", "p1"))?.data.title).toBe("b");
	});

	it("keeps the loose vi.fn mock by default", async () => {
		const ctx = makeContext();
		await expect(ctx.content!.update("x", "y", { anything: 1 })).resolves.toEqual({});
	});
});

describe("kv and settings", () => {
	it("kv round-trips, lists by prefix and does compare-and-set", async () => {
		const { kv } = makeContext();
		expect(await kv.get("a")).toBeNull();
		await kv.set("a:1", 1);
		await kv.set("b:1", 2);
		expect(await kv.list("a:")).toEqual([{ key: "a:1", value: 1 }]);
		const v = await kv.getVersioned("a:1");
		expect(await kv.compareAndSet("a:1", "stale", 9)).toEqual({ applied: false });
		expect((await kv.compareAndSet("a:1", v!.revision, 9)).applied).toBe(true);
		expect(await kv.compareAndSet("a:1", null, 5)).toEqual({ applied: false });
		expect(await kv.delete("a:1")).toBe(true);
		expect(await kv.delete("a:1")).toBe(false);
	});

	it("settings.get() is null when unset and secrets must be strings", async () => {
		const ctx = makeContext({ settingsSchema: { token: { type: "secret" } } });
		expect(await ctx.settings.get("token")).toBeNull();
		await expect(ctx.settings.set("token", 1)).rejects.toThrow("must be strings");
		await ctx.settings.set("token", "s");
		expect(await ctx.kv.get("settings:token")).toBe("s");
	});
});

describe("storage and redirects", () => {
	it("storage put/get/query/delete", async () => {
		const ctx = makeContext({ storageCollections: ["clicks"] });
		const c = ctx.storage.clicks!;
		await c.put("a", { n: 1 });
		await c.put("b", { n: 2 });
		expect(await c.get("a")).toEqual({ n: 1 });
		expect((await c.query({ where: { n: 2 } })).items).toEqual([{ id: "b", data: { n: 2 } }]);
		expect(await c.delete("a")).toBe(true);
		expect(await c.count()).toBe(1);
	});

	it("redirects create/get/list/update/delete with _rev", async () => {
		const { redirects } = makeContext();
		const { redirect, _rev } = await redirects.create({
			source: "/a",
			destination: "/b",
			groupName: "g",
		});
		const id = redirect.id as string;
		expect(redirect).toMatchObject({ source: "/a", type: 301, groupName: "g" });
		expect((await redirects.list({ group: "g" })).items).toHaveLength(1);
		await expect(redirects.update(id, { _rev: "x", type: 302 })).rejects.toThrow();
		const up = await redirects.update(id, { _rev, type: 302 });
		expect(up.redirect.type).toBe(302);
		expect(await redirects.delete(id, { _rev: up._rev })).toBe(true);
		expect(await redirects.get(id)).toBeNull();
	});
});

describe("http and log", () => {
	it("rejects hosts outside allowedHosts and records the rest", async () => {
		const ctx = makeContext({ allowedHosts: ["*.example.com"] });
		await ctx.http!.fetch("https://api.example.com/x");
		await expect(ctx.http!.fetch("https://evil.com/x")).rejects.toThrow(
			'is not allowed to fetch from host "evil.com"',
		);
		expect(ctx.fetchCalls.map((c) => c.url)).toEqual(["https://api.example.com/x"]);
		await expect(makeContext({ allowedHosts: [] }).http!.fetch("https://a.com")).rejects.toThrow(
			"no allowed hosts",
		);
	});

	it("records log lines", () => {
		const ctx = makeContext();
		ctx.log.warn("careful", { a: 1 });
		expect(ctx.logs).toEqual([{ level: "warn", message: "careful", data: { a: 1 } }]);
	});
});

describe("runHook", () => {
	it("runs bare and config-form hooks", async () => {
		const ctx = makeContext();
		const plugin = { hooks: { a: async () => 1, b: { handler: async () => 2 } } };
		expect(await runHook(plugin, "a", {}, ctx)).toBe(1);
		expect(await runHook(plugin, "b", {}, ctx)).toBe(2);
		await expect(runHook(plugin, "nope", {}, ctx)).rejects.toThrow("no hook");
	});

	it("rejects after the hook timeout", async () => {
		vi.useFakeTimers();
		const slow = { hooks: { h: { timeout: 50, handler: () => new Promise(() => {}) } } };
		const p = expect(runHook(slow, "h", {}, makeContext())).rejects.toThrow(
			"Hook timeout after 50ms",
		);
		await vi.advanceTimersByTimeAsync(60);
		await p;
		const dflt = { hooks: { h: () => new Promise(() => {}) } };
		const p2 = expect(runHook(dflt, "h", {}, makeContext())).rejects.toThrow(
			"Hook timeout after 5000ms",
		);
		await vi.advanceTimersByTimeAsync(5001);
		await p2;
		vi.useRealTimers();
	});
});

describe("callRoute", () => {
	const plugin = {
		routes: {
			ok: { handler: async (r: any) => ({ url: r.request.url }) },
			boom: async () => {
				throw new Error("secret detail");
			},
			typed: async () => {
				throw Object.assign(new Error("nope"), {
					name: "PluginRouteError",
					code: "NOT_FOUND",
					status: 404,
				});
			},
			post: { methods: ["POST"], handler: async () => ({}) },
		},
	};

	it("wraps success", async () => {
		const res = await callRoute(plugin, "ok", { query: { id: "x" } });
		expect(res).toEqual({
			success: true,
			data: { url: "http://localhost:4321/_emdash/api/plugins/test-plugin/ok?id=x" },
		});
		expect((res as any).status).toBe(200);
	});

	it("wraps errors and hides unknown messages", async () => {
		expect(await callRoute(plugin, "boom")).toEqual({
			success: false,
			error: { code: "INTERNAL_ERROR", message: "Plugin route error" },
		});
		expect(await callRoute(plugin, "typed")).toMatchObject({
			success: false,
			error: { code: "NOT_FOUND", message: "nope" },
		});
		expect(await callRoute(plugin, "missing")).toMatchObject({ error: { code: "NOT_FOUND" } });
		expect(await callRoute(plugin, "post")).toMatchObject({
			error: { code: "METHOD_NOT_ALLOWED" },
		});
	});
});

describe("makePost", () => {
	it("id is the slug and data.id is a ULID", () => {
		const post = makePost({ slug: "hello" });
		expect(post.id).toBe("hello");
		expect(post.data.id).toMatch(/^[0-9A-Z]{26}$/);
		expect(Array.isArray(post.data.content)).toBe(true);
		expect(makePost({ fieldName: "body" }).data.body).toBeDefined();
	});
});

// Bodies below were captured with curl from a real EmDash 1.0.1 site running @plugdash/heartpost 0.2.2:
//   GET /_emdash/api/plugins/heartpost/heart-status?id=abc -> {"success":true,"data":{"count":0,"hearted":false}}
//   GET /_emdash/api/plugins/heartpost/heart-status        -> {"success":true,"data":{"error":"missing_id"}}
//   GET /_emdash/api/plugins/heartpost/nope                -> 404 {"success":false,"error":{"code":"NOT_FOUND","message":"Plugin route not found"}}
describe("callRoute matches a real heartpost response", () => {
	it("heart-status", async () => {
		const { default: heartpost } = await import("../../../packages/heartpost/src/sandbox-entry");
		const headers = { "user-agent": "ua1" };
		expect(await callRoute(heartpost, "heart-status", { query: { id: "abc" }, headers })).toEqual({
			success: true,
			data: { count: 0, hearted: false },
		});
		expect(await callRoute(heartpost, "heart-status", { headers })).toEqual({
			success: true,
			data: { error: "missing_id" },
		});
		expect(await callRoute(heartpost, "nope")).toEqual({
			success: false,
			error: { code: "NOT_FOUND", message: "Plugin route not found" },
		});
	});
});
