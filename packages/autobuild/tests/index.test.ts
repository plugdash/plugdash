import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
	validateHookUrl,
	isPrivateHostname,
	shouldTrigger,
	Debouncer,
} from "../src/sandbox-entry.ts";
import { parseHookHostname } from "../src/index.ts";
import { makeContext, makeContentItem } from "@plugdash/testing";

// ── validateHookUrl ──

describe("validateHookUrl", () => {
	it("accepts https://api.cloudflare.com/client/v4/pages/projects/foo/deployments", () => {
		const result = validateHookUrl(
			"https://api.cloudflare.com/client/v4/pages/projects/foo/deployments",
		);
		expect(result.ok).toBe(true);
	});

	it("accepts https://api.netlify.com/build_hooks/abc123", () => {
		const result = validateHookUrl("https://api.netlify.com/build_hooks/abc123");
		expect(result.ok).toBe(true);
	});

	it("accepts https://api.vercel.com/v1/integrations/deploy/prj_abc/xyz", () => {
		const result = validateHookUrl(
			"https://api.vercel.com/v1/integrations/deploy/prj_abc/xyz",
		);
		expect(result.ok).toBe(true);
	});

	it("rejects http:// urls", () => {
		const result = validateHookUrl("http://api.cloudflare.com/foo");
		expect(result.ok).toBe(false);
	});

	it("rejects localhost", () => {
		const result = validateHookUrl("https://localhost/hook");
		expect(result.ok).toBe(false);
	});

	it("rejects 127.0.0.1", () => {
		const result = validateHookUrl("https://127.0.0.1/hook");
		expect(result.ok).toBe(false);
	});

	it("rejects 0.0.0.0", () => {
		const result = validateHookUrl("https://0.0.0.0/hook");
		expect(result.ok).toBe(false);
	});

	it("rejects ::1", () => {
		const result = validateHookUrl("https://[::1]/hook");
		expect(result.ok).toBe(false);
	});

	it("rejects 10.0.0.1", () => {
		const result = validateHookUrl("https://10.0.0.1/hook");
		expect(result.ok).toBe(false);
	});

	it("rejects 10.255.255.255", () => {
		const result = validateHookUrl("https://10.255.255.255/hook");
		expect(result.ok).toBe(false);
	});

	it("rejects 172.16.0.1 through 172.31.255.255 (RFC1918)", () => {
		expect(validateHookUrl("https://172.16.0.1/hook").ok).toBe(false);
		expect(validateHookUrl("https://172.20.5.10/hook").ok).toBe(false);
		expect(validateHookUrl("https://172.31.255.255/hook").ok).toBe(false);
	});

	it("accepts 172.15.0.1 and 172.32.0.1 (outside RFC1918)", () => {
		expect(validateHookUrl("https://172.15.0.1/hook").ok).toBe(true);
		expect(validateHookUrl("https://172.32.0.1/hook").ok).toBe(true);
	});

	it("rejects 192.168.1.1", () => {
		const result = validateHookUrl("https://192.168.1.1/hook");
		expect(result.ok).toBe(false);
	});

	it("rejects 169.254.169.254 (AWS metadata endpoint)", () => {
		const result = validateHookUrl("https://169.254.169.254/latest/meta-data");
		expect(result.ok).toBe(false);
	});

	it("rejects malformed URLs", () => {
		expect(validateHookUrl("not a url").ok).toBe(false);
		expect(validateHookUrl("https://").ok).toBe(false);
		expect(validateHookUrl("://foo.com").ok).toBe(false);
	});

	it("rejects empty string", () => {
		expect(validateHookUrl("").ok).toBe(false);
	});

	it("rejects undefined", () => {
		expect(validateHookUrl(undefined).ok).toBe(false);
	});

	it("rejects non-string input", () => {
		expect(validateHookUrl(42).ok).toBe(false);
		expect(validateHookUrl(null).ok).toBe(false);
		expect(validateHookUrl({}).ok).toBe(false);
	});
});

// ── isPrivateHostname ──

describe("isPrivateHostname", () => {
	it("matches localhost", () => {
		expect(isPrivateHostname("localhost")).toBe(true);
	});

	it("matches 127.0.0.1", () => {
		expect(isPrivateHostname("127.0.0.1")).toBe(true);
	});

	it("matches 127.x.x.x loopback range", () => {
		expect(isPrivateHostname("127.1.2.3")).toBe(true);
	});

	it("matches 0.0.0.0", () => {
		expect(isPrivateHostname("0.0.0.0")).toBe(true);
	});

	it("matches ::1", () => {
		expect(isPrivateHostname("::1")).toBe(true);
	});

	it("matches 10.x.x.x", () => {
		expect(isPrivateHostname("10.0.0.1")).toBe(true);
		expect(isPrivateHostname("10.255.255.255")).toBe(true);
	});

	it("matches 172.16-31.x.x", () => {
		expect(isPrivateHostname("172.16.0.1")).toBe(true);
		expect(isPrivateHostname("172.31.255.255")).toBe(true);
	});

	it("does not match 172.15.x or 172.32.x", () => {
		expect(isPrivateHostname("172.15.0.1")).toBe(false);
		expect(isPrivateHostname("172.32.0.1")).toBe(false);
	});

	it("matches 192.168.x.x", () => {
		expect(isPrivateHostname("192.168.0.1")).toBe(true);
	});

	it("matches 169.254.x.x link-local", () => {
		expect(isPrivateHostname("169.254.169.254")).toBe(true);
	});

	it("does not match public IPs or hostnames", () => {
		expect(isPrivateHostname("api.cloudflare.com")).toBe(false);
		expect(isPrivateHostname("8.8.8.8")).toBe(false);
		expect(isPrivateHostname("1.1.1.1")).toBe(false);
	});
});

// ── parseHookHostname ──

describe("parseHookHostname", () => {
	it("returns hostname for valid https URL", () => {
		expect(parseHookHostname("https://api.cloudflare.com/foo")).toBe(
			"api.cloudflare.com",
		);
	});

	it("returns null for empty string", () => {
		expect(parseHookHostname("")).toBe(null);
	});

	it("returns null for undefined", () => {
		expect(parseHookHostname(undefined)).toBe(null);
	});

	it("returns null for malformed URL", () => {
		expect(parseHookHostname("not a url")).toBe(null);
	});
});

// ── shouldTrigger ──

describe("shouldTrigger", () => {
	const defaultConfig = { statuses: ["published"] as string[] };

	it("returns true when status is published and statuses defaults to ['published']", () => {
		const event = { content: { status: "published" }, collection: "posts" };
		expect(shouldTrigger(event, defaultConfig)).toBe(true);
	});

	it("returns false when status is draft and statuses defaults", () => {
		const event = { content: { status: "draft" }, collection: "posts" };
		expect(shouldTrigger(event, defaultConfig)).toBe(false);
	});

	it("returns false when status is archived and statuses defaults", () => {
		const event = { content: { status: "archived" }, collection: "posts" };
		expect(shouldTrigger(event, defaultConfig)).toBe(false);
	});

	it("returns true when status matches custom statuses list", () => {
		const event = { content: { status: "draft" }, collection: "posts" };
		expect(
			shouldTrigger(event, { statuses: ["published", "draft"] }),
		).toBe(true);
	});

	it("returns true when collection is in collections list", () => {
		const event = { content: { status: "published" }, collection: "blog" };
		expect(
			shouldTrigger(event, {
				statuses: ["published"],
				collections: ["blog", "news"],
			}),
		).toBe(true);
	});

	it("returns false when collection is not in collections list", () => {
		const event = { content: { status: "published" }, collection: "pages" };
		expect(
			shouldTrigger(event, {
				statuses: ["published"],
				collections: ["blog"],
			}),
		).toBe(false);
	});

	it("returns true when collections is undefined (all collections)", () => {
		const event = { content: { status: "published" }, collection: "anything" };
		expect(shouldTrigger(event, { statuses: ["published"] })).toBe(true);
	});

	it("does not throw when event.content is undefined (afterDelete case)", () => {
		const event = { collection: "posts" } as {
			content?: { status?: unknown };
			collection: string;
		};
		expect(() => shouldTrigger(event, defaultConfig)).not.toThrow();
	});

	it("treats undefined event.content as passing the status check (afterDelete)", () => {
		const event = { collection: "posts" } as {
			content?: { status?: unknown };
			collection: string;
		};
		expect(shouldTrigger(event, defaultConfig)).toBe(true);
	});

	it("still applies collection filter when event.content is undefined", () => {
		const event = { collection: "pages" } as {
			content?: { status?: unknown };
			collection: string;
		};
		expect(
			shouldTrigger(event, {
				statuses: ["published"],
				collections: ["blog"],
			}),
		).toBe(false);
	});
});

// ── Debouncer ──

describe("Debouncer", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("fires the scheduled function once after the window", async () => {
		const deb = new Debouncer();
		const fn = vi.fn().mockResolvedValue(undefined);
		deb.schedule(100, fn);
		expect(fn).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(100);
		expect(fn).toHaveBeenCalledTimes(1);
	});

	it("coalesces three rapid schedule() calls into a single fire", async () => {
		const deb = new Debouncer();
		const fn = vi.fn().mockResolvedValue(undefined);
		deb.schedule(100, fn);
		deb.schedule(100, fn);
		deb.schedule(100, fn);
		await vi.advanceTimersByTimeAsync(100);
		expect(fn).toHaveBeenCalledTimes(1);
	});

	it("resets the timer when a new schedule() arrives mid-window", async () => {
		const deb = new Debouncer();
		const fn = vi.fn().mockResolvedValue(undefined);
		deb.schedule(100, fn);
		await vi.advanceTimersByTimeAsync(50);
		deb.schedule(100, fn); // reset
		await vi.advanceTimersByTimeAsync(50); // 100ms total, but window reset at 50ms
		expect(fn).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(50); // now 100ms since reset
		expect(fn).toHaveBeenCalledTimes(1);
	});

	it("fires again for a new event after a completed window", async () => {
		const deb = new Debouncer();
		const fn = vi.fn().mockResolvedValue(undefined);
		deb.schedule(100, fn);
		await vi.advanceTimersByTimeAsync(100);
		expect(fn).toHaveBeenCalledTimes(1);
		deb.schedule(100, fn);
		await vi.advanceTimersByTimeAsync(100);
		expect(fn).toHaveBeenCalledTimes(2);
	});
});

// ── autobuild hook: content:afterSave ──

describe("autobuild hook: content:afterSave", () => {
	let ctx: ReturnType<typeof makeContext>;
	let fetchMock: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		vi.useFakeTimers();
		fetchMock = vi.fn().mockResolvedValue(
			new Response("ok", { status: 200 }),
		);
		ctx = makeContext({
			http: { fetch: fetchMock },
			kv: {
				get: vi.fn().mockImplementation((key: string) => {
					if (key === "autobuild:config:hookUrl")
						return Promise.resolve("https://api.cloudflare.com/hook");
					if (key === "autobuild:config:debounceMs") return Promise.resolve(50);
					if (key === "autobuild:config:statuses")
						return Promise.resolve(["published"]);
					if (key === "autobuild:config:collections") return Promise.resolve(null);
					if (key === "autobuild:config:method") return Promise.resolve("POST");
					if (key === "autobuild:bootstrapHash") return Promise.resolve(null);
					return Promise.resolve(null);
				}),
				set: vi.fn().mockResolvedValue(undefined),
				delete: vi.fn().mockResolvedValue(undefined),
				list: vi.fn().mockResolvedValue([]),
			},
		});
		(globalThis as Record<string, unknown>).__plugdash_autobuild_config__ =
			undefined;
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	async function runSaveHook(
		content: Record<string, unknown>,
		collection = "posts",
	) {
		const plugin = await import("../src/sandbox-entry.ts");
		const hook = plugin.default.hooks!["content:afterSave"];
		const event = { content, collection, isNew: false };
		await hook.handler(event, ctx);
	}

	it("fires webhook on published content after debounce window", async () => {
		const content = makeContentItem({ status: "published" });
		await runSaveHook(content, "posts");
		expect(fetchMock).not.toHaveBeenCalled(); // debounced
		await vi.advanceTimersByTimeAsync(60);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(fetchMock.mock.calls[0]![0]).toBe("https://api.cloudflare.com/hook");
	});

	it("skips draft content", async () => {
		const content = makeContentItem({ status: "draft" });
		await runSaveHook(content, "posts");
		await vi.advanceTimersByTimeAsync(100);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("skips archived content", async () => {
		const content = makeContentItem({ status: "archived" });
		await runSaveHook(content, "posts");
		await vi.advanceTimersByTimeAsync(100);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("skips scheduled content", async () => {
		const content = makeContentItem({ status: "scheduled" });
		await runSaveHook(content, "posts");
		await vi.advanceTimersByTimeAsync(100);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("skips collection not in collections filter", async () => {
		ctx.kv.get = vi.fn().mockImplementation((key: string) => {
			if (key === "autobuild:config:hookUrl")
				return Promise.resolve("https://api.cloudflare.com/hook");
			if (key === "autobuild:config:debounceMs") return Promise.resolve(50);
			if (key === "autobuild:config:statuses")
				return Promise.resolve(["published"]);
			if (key === "autobuild:config:collections")
				return Promise.resolve(["blog"]);
			if (key === "autobuild:config:method") return Promise.resolve("POST");
			if (key === "autobuild:bootstrapHash") return Promise.resolve(null);
			return Promise.resolve(null);
		});
		const content = makeContentItem({ status: "published" });
		await runSaveHook(content, "pages");
		await vi.advanceTimersByTimeAsync(100);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("no-ops when hookUrl is empty", async () => {
		ctx.kv.get = vi.fn().mockImplementation((key: string) => {
			if (key === "autobuild:config:hookUrl") return Promise.resolve("");
			if (key === "autobuild:config:debounceMs") return Promise.resolve(50);
			if (key === "autobuild:config:statuses")
				return Promise.resolve(["published"]);
			return Promise.resolve(null);
		});
		const content = makeContentItem({ status: "published" });
		await runSaveHook(content, "posts");
		await vi.advanceTimersByTimeAsync(100);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("logs error when webhook returns 500", async () => {
		fetchMock.mockResolvedValue(new Response("err", { status: 500 }));
		const content = makeContentItem({ status: "published" });
		await runSaveHook(content, "posts");
		await vi.advanceTimersByTimeAsync(60);
		await Promise.resolve();
		await Promise.resolve();
		expect(ctx.log.error).toHaveBeenCalled();
	});

	it("logs error when webhook rejects (network failure)", async () => {
		fetchMock.mockRejectedValue(new Error("network down"));
		const content = makeContentItem({ status: "published" });
		await runSaveHook(content, "posts");
		await vi.advanceTimersByTimeAsync(60);
		await Promise.resolve();
		await Promise.resolve();
		expect(ctx.log.error).toHaveBeenCalled();
	});

	it("does not throw when ctx.http is missing", async () => {
		ctx = makeContext({
			http: undefined,
			kv: ctx.kv,
		});
		const content = makeContentItem({ status: "published" });
		await expect(runSaveHook(content, "posts")).resolves.toBeUndefined();
		await vi.advanceTimersByTimeAsync(100);
	});

	it("does not block publish event on webhook latency (handler resolves before fetch)", async () => {
		fetchMock.mockImplementation(
			() =>
				new Promise((resolve) =>
					setTimeout(
						() => resolve(new Response("ok", { status: 200 })),
						10_000,
					),
				),
		);
		const content = makeContentItem({ status: "published" });
		await runSaveHook(content, "posts");
		expect(true).toBe(true);
	});

	it("logs error when webhook times out (AbortController aborts hanging fetch)", async () => {
		ctx.kv.get = vi.fn().mockImplementation((key: string) => {
			if (key === "autobuild:config:hookUrl")
				return Promise.resolve("https://api.cloudflare.com/hook");
			if (key === "autobuild:config:debounceMs") return Promise.resolve(50);
			if (key === "autobuild:config:timeout") return Promise.resolve(30);
			if (key === "autobuild:config:statuses")
				return Promise.resolve(["published"]);
			if (key === "autobuild:config:method") return Promise.resolve("POST");
			if (key === "autobuild:bootstrapHash") return Promise.resolve(null);
			return Promise.resolve(null);
		});

		// Fetch that never resolves unless aborted via signal
		fetchMock.mockImplementation((_url: string, init: RequestInit) => {
			return new Promise((_resolve, reject) => {
				const signal = init?.signal as AbortSignal | undefined;
				if (signal) {
					const onAbort = () => {
						reject(new Error("The operation was aborted"));
					};
					if (signal.aborted) onAbort();
					else signal.addEventListener("abort", onAbort);
				}
			});
		});

		const content = makeContentItem({ status: "published" });
		await runSaveHook(content, "posts");
		// Advance past debounce window (50ms) then past timeout (30ms more)
		await vi.advanceTimersByTimeAsync(60);
		await vi.advanceTimersByTimeAsync(40);
		await Promise.resolve();
		await Promise.resolve();
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(ctx.log.error).toHaveBeenCalled();
		const errorMessages = (ctx.log.error as ReturnType<typeof vi.fn>).mock.calls.map(
			(c) => c[0],
		);
		expect(
			errorMessages.some((m) => typeof m === "string" && m.includes("failed")),
		).toBe(true);
	});

	it("rejects private-IP hookUrl and logs error", async () => {
		ctx.kv.get = vi.fn().mockImplementation((key: string) => {
			if (key === "autobuild:config:hookUrl")
				return Promise.resolve("https://192.168.1.1/hook");
			if (key === "autobuild:config:debounceMs") return Promise.resolve(50);
			if (key === "autobuild:config:statuses")
				return Promise.resolve(["published"]);
			return Promise.resolve(null);
		});
		const content = makeContentItem({ status: "published" });
		await runSaveHook(content, "posts");
		await vi.advanceTimersByTimeAsync(60);
		await Promise.resolve();
		await Promise.resolve();
		expect(fetchMock).not.toHaveBeenCalled();
		expect(ctx.log.error).toHaveBeenCalled();
	});
});

// ── autobuild hook: content:afterDelete ──

describe("autobuild hook: content:afterDelete", () => {
	let ctx: ReturnType<typeof makeContext>;
	let fetchMock: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		vi.useFakeTimers();
		fetchMock = vi.fn().mockResolvedValue(
			new Response("ok", { status: 200 }),
		);
		ctx = makeContext({
			http: { fetch: fetchMock },
			kv: {
				get: vi.fn().mockImplementation((key: string) => {
					if (key === "autobuild:config:hookUrl")
						return Promise.resolve("https://api.cloudflare.com/hook");
					if (key === "autobuild:config:debounceMs") return Promise.resolve(50);
					if (key === "autobuild:config:statuses")
						return Promise.resolve(["published"]);
					if (key === "autobuild:config:collections") return Promise.resolve(null);
					if (key === "autobuild:config:method") return Promise.resolve("POST");
					if (key === "autobuild:bootstrapHash") return Promise.resolve(null);
					return Promise.resolve(null);
				}),
				set: vi.fn().mockResolvedValue(undefined),
				delete: vi.fn().mockResolvedValue(undefined),
				list: vi.fn().mockResolvedValue([]),
			},
		});
		(globalThis as Record<string, unknown>).__plugdash_autobuild_config__ =
			undefined;
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	async function runDeleteHook(id: string, collection: string) {
		const plugin = await import("../src/sandbox-entry.ts");
		const hook = plugin.default.hooks!["content:afterDelete"];
		const event = { id, collection };
		await hook.handler(event, ctx);
	}

	it("fires webhook on delete event (no status check)", async () => {
		await runDeleteHook("post-1", "posts");
		await vi.advanceTimersByTimeAsync(60);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it("respects collections filter on delete", async () => {
		ctx.kv.get = vi.fn().mockImplementation((key: string) => {
			if (key === "autobuild:config:hookUrl")
				return Promise.resolve("https://api.cloudflare.com/hook");
			if (key === "autobuild:config:debounceMs") return Promise.resolve(50);
			if (key === "autobuild:config:statuses")
				return Promise.resolve(["published"]);
			if (key === "autobuild:config:collections")
				return Promise.resolve(["blog"]);
			if (key === "autobuild:config:method") return Promise.resolve("POST");
			if (key === "autobuild:bootstrapHash") return Promise.resolve(null);
			return Promise.resolve(null);
		});
		await runDeleteHook("page-1", "pages");
		await vi.advanceTimersByTimeAsync(100);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("does not throw when event has no content field", async () => {
		await expect(runDeleteHook("p-1", "posts")).resolves.toBeUndefined();
	});
});

// ── autobuild hook: plugin:install ──

describe("autobuild hook: plugin:install", () => {
	let ctx: ReturnType<typeof makeContext>;

	beforeEach(() => {
		ctx = makeContext({
			kv: {
				get: vi.fn().mockResolvedValue(null),
				set: vi.fn().mockResolvedValue(undefined),
				delete: vi.fn().mockResolvedValue(undefined),
				list: vi.fn().mockResolvedValue([]),
			},
		});
		(globalThis as Record<string, unknown>).__plugdash_autobuild_config__ =
			undefined;
	});

	afterEach(() => {
		(globalThis as Record<string, unknown>).__plugdash_autobuild_config__ =
			undefined;
	});

	async function runInstall() {
		const plugin = await import("../src/sandbox-entry.ts");
		const hook = plugin.default.hooks!["plugin:install"];
		await hook.handler({}, ctx);
	}

	it("seeds KV from globalThis bootstrap when present", async () => {
		(globalThis as Record<string, unknown>).__plugdash_autobuild_config__ = {
			hookUrl: "https://api.cloudflare.com/hook",
			debounceMs: 3000,
			collections: ["blog"],
		};
		await runInstall();
		expect(ctx.kv.set).toHaveBeenCalledWith(
			"autobuild:config:hookUrl",
			"https://api.cloudflare.com/hook",
		);
		expect(ctx.kv.set).toHaveBeenCalledWith("autobuild:config:debounceMs", 3000);
		expect(ctx.kv.set).toHaveBeenCalledWith("autobuild:config:collections", [
			"blog",
		]);
	});

	it("logs warning once when hookUrl is missing", async () => {
		(globalThis as Record<string, unknown>).__plugdash_autobuild_config__ = {
			hookUrl: "",
		};
		await runInstall();
		expect(ctx.log.warn).toHaveBeenCalled();
	});

	it("writes a bootstrap hash to KV after seeding", async () => {
		(globalThis as Record<string, unknown>).__plugdash_autobuild_config__ = {
			hookUrl: "https://api.cloudflare.com/hook",
		};
		await runInstall();
		const hashCall = (ctx.kv.set as ReturnType<typeof vi.fn>).mock.calls.find(
			(c) => c[0] === "autobuild:bootstrapHash",
		);
		expect(hashCall).toBeDefined();
	});
});

// ── bootstrap hash reseed ──

describe("bootstrap hash reseed on hook invocation", () => {
	let ctx: ReturnType<typeof makeContext>;
	let fetchMock: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		vi.useFakeTimers();
		fetchMock = vi.fn().mockResolvedValue(
			new Response("ok", { status: 200 }),
		);
		(globalThis as Record<string, unknown>).__plugdash_autobuild_config__ =
			undefined;
	});

	afterEach(() => {
		vi.useRealTimers();
		(globalThis as Record<string, unknown>).__plugdash_autobuild_config__ =
			undefined;
	});

	it("reseeds KV when globalThis bootstrap hash differs from stored hash", async () => {
		(globalThis as Record<string, unknown>).__plugdash_autobuild_config__ = {
			hookUrl: "https://api.cloudflare.com/new-hook",
		};
		ctx = makeContext({
			http: { fetch: fetchMock },
			kv: {
				get: vi.fn().mockImplementation((key: string) => {
					if (key === "autobuild:config:hookUrl")
						return Promise.resolve("https://api.cloudflare.com/old-hook");
					if (key === "autobuild:config:debounceMs") return Promise.resolve(50);
					if (key === "autobuild:config:statuses")
						return Promise.resolve(["published"]);
					if (key === "autobuild:bootstrapHash")
						return Promise.resolve("old-hash-value");
					return Promise.resolve(null);
				}),
				set: vi.fn().mockResolvedValue(undefined),
				delete: vi.fn().mockResolvedValue(undefined),
				list: vi.fn().mockResolvedValue([]),
			},
		});

		const plugin = await import("../src/sandbox-entry.ts");
		const hook = plugin.default.hooks!["content:afterSave"];
		const content = makeContentItem({ status: "published" });
		await hook.handler(
			{ content, collection: "posts", isNew: false },
			ctx,
		);

		expect(ctx.kv.set).toHaveBeenCalledWith(
			"autobuild:config:hookUrl",
			"https://api.cloudflare.com/new-hook",
		);
	});
});
