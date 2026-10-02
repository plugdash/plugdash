import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
	autobuildPlugin,
	createPlugin,
	getOptions,
	hostAllowed,
	isPrivateHostname,
	parseHookHostname,
	resetWarnings,
	validateHookUrl,
} from "../src/index.ts";

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
		const result = validateHookUrl("https://api.vercel.com/v1/integrations/deploy/prj_abc/xyz");
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
		expect(parseHookHostname("https://api.cloudflare.com/foo")).toBe("api.cloudflare.com");
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

// ── options and descriptor ──

describe("options", () => {
	it("defaults", () => {
		expect(getOptions()).toMatchObject({
			hookUrl: "",
			method: "POST",
			collections: [],
			debounceMs: 5000,
			timeout: 5000,
		});
	});

	it("allowedHosts = defaults + extra + hookUrl host", () => {
		const o = getOptions({ hookUrl: "https://hooks.example.com/x", allowedHosts: ["a.test"] });
		expect(o.allowedHosts).toEqual([
			"api.cloudflare.com",
			"api.netlify.com",
			"api.vercel.com",
			"a.test",
			"hooks.example.com",
		]);
	});

	it("hostAllowed supports wildcards", () => {
		expect(hostAllowed("a.b.com", ["*.b.com"])).toBe(true);
		expect(hostAllowed("b.com", ["*.b.com"])).toBe(false);
	});

	it("descriptor is native and carries options", () => {
		const d = autobuildPlugin({ hookUrl: "https://api.netlify.com/build_hooks/x" });
		expect(d).toMatchObject({
			format: "native",
			entrypoint: "@plugdash/autobuild",
			options: { hookUrl: "https://api.netlify.com/build_hooks/x" },
		});
		expect(d.capabilities).toEqual(["content:read", "network:request"]);
	});
});

// ── hooks ──

const HOOK = "https://api.netlify.com/build_hooks/abc";

function makeCtx(settings: Record<string, string> = {}) {
	const store = new Map<string, unknown>();
	const entries = new Map<string, { status: string }>();
	return {
		store,
		entries,
		log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
		settings: { get: vi.fn(async (k: string) => settings[k] ?? null) },
		kv: {
			get: vi.fn(async (k: string) => store.get(k) ?? null),
			set: vi.fn(async (k: string, v: unknown) => void store.set(k, v)),
			delete: vi.fn(async (k: string) => store.delete(k)),
		},
		content: { get: vi.fn(async (_c: string, id: string) => entries.get(id) ?? null) },
		http: { fetch: vi.fn(async () => new Response("ok", { status: 200 })) },
	};
}

type Handler = (e: unknown, c: unknown) => Promise<void>;

const hook = (opts: Parameters<typeof createPlugin>[0], name: string) => {
	const h = (createPlugin(opts).hooks as unknown as Record<string, { handler: Handler }>)[name];
	return h!.handler;
};

describe("autobuild hooks", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		resetWarnings();
	});
	afterEach(() => vi.useRealTimers());

	const publish = { collection: "posts", content: { id: "1", status: "published" } };

	it("registers no afterSave hook", () => {
		expect(Object.keys(createPlugin({ hookUrl: HOOK }).hooks)).not.toContain("content:afterSave");
	});

	it("5 publishes inside debounceMs make 1 fetch", async () => {
		const ctx = makeCtx();
		const h = hook({ hookUrl: HOOK, debounceMs: 1000 }, "content:afterPublish");
		const runs = Array.from({ length: 5 }, () => h(publish, ctx));
		await vi.advanceTimersByTimeAsync(1500);
		await Promise.all(runs);
		expect(ctx.http.fetch).toHaveBeenCalledTimes(1);
		expect(ctx.http.fetch).toHaveBeenCalledWith(HOOK, expect.objectContaining({ method: "POST" }));
	});

	it("unpublish makes 1 fetch", async () => {
		const ctx = makeCtx();
		const run = hook({ hookUrl: HOOK, debounceMs: 100 }, "content:afterUnpublish")(
			{ collection: "posts", content: { id: "1", status: "draft" } },
			ctx,
		);
		await vi.advanceTimersByTimeAsync(200);
		await run;
		expect(ctx.http.fetch).toHaveBeenCalledTimes(1);
	});

	it("delete of a published entry fires, delete of a draft does not", async () => {
		const opts = { hookUrl: HOOK, debounceMs: 100 };
		const ctx = makeCtx();
		ctx.entries.set("live", { status: "published" });
		ctx.entries.set("draft", { status: "draft" });
		for (const id of ["live", "draft"]) {
			await hook(opts, "content:beforeDelete")({ id, collection: "posts" }, ctx);
			const run = hook(opts, "content:afterDelete")(
				{ id, collection: "posts", permanent: false },
				ctx,
			);
			await vi.advanceTimersByTimeAsync(200);
			await run;
		}
		expect(ctx.http.fetch).toHaveBeenCalledTimes(1);
		expect(ctx.store.has("live:live")).toBe(false);
	});

	it("other collections are ignored", async () => {
		const ctx = makeCtx();
		const run = hook(
			{ hookUrl: HOOK, collections: ["docs"], debounceMs: 10 },
			"content:afterPublish",
		)(publish, ctx);
		await vi.advanceTimersByTimeAsync(50);
		await run;
		expect(ctx.http.fetch).not.toHaveBeenCalled();
	});

	it("missing hook url warns once, never throws", async () => {
		const ctx = makeCtx();
		const h = hook({}, "content:afterPublish");
		await h(publish, ctx);
		await h(publish, ctx);
		expect(ctx.log.warn).toHaveBeenCalledTimes(1);
		expect(ctx.log.warn).toHaveBeenCalledWith("no hook URL configured, deploys are off");
		expect(ctx.http.fetch).not.toHaveBeenCalled();
	});

	it("admin secret wins over the option", async () => {
		const other = "https://api.vercel.com/v1/integrations/deploy/x";
		const ctx = makeCtx({ hookUrl: other });
		const run = hook({ hookUrl: HOOK, debounceMs: 10 }, "content:afterPublish")(publish, ctx);
		await vi.advanceTimersByTimeAsync(50);
		await run;
		expect(ctx.http.fetch).toHaveBeenCalledWith(other, expect.anything());
	});

	it("blocks a host that is not allowed", async () => {
		const ctx = makeCtx({ hookUrl: "https://evil.example.com/x" });
		const run = hook({ debounceMs: 10 }, "content:afterPublish")(publish, ctx);
		await vi.advanceTimersByTimeAsync(50);
		await run;
		expect(ctx.http.fetch).not.toHaveBeenCalled();
		expect(ctx.log.error).toHaveBeenCalled();
	});

	it("hook timeout covers debounce + request + 5s", () => {
		const p = createPlugin({ hookUrl: HOOK, debounceMs: 2000, timeout: 3000 });
		expect(p.hooks["content:afterPublish"]?.timeout).toBe(10000);
	});

	it("admin page reports a disallowed host", async () => {
		const ctx = makeCtx({ hookUrl: "https://evil.example.com/x" });
		const route = createPlugin().routes!.admin!;
		const res = await route.handler(ctx as never);
		expect(JSON.stringify(res)).toContain("not allowed");
	});
});
