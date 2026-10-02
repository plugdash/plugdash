import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PluginContext } from "emdash";
import { TOOL_NAME } from "../src/enrich-logic.ts";
import { createPlugin, enrichkitPlugin, type EnrichkitOptions } from "../src/index.ts";

const words = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(" ");
const pt = (text: string) => [{ _type: "block", children: [{ _type: "span", text }] }];

function toolReply(input: Record<string, unknown>) {
	return new Response(
		JSON.stringify({ content: [{ type: "tool_use", name: TOOL_NAME, input }], usage: {} }),
		{ status: 200 },
	);
}

const GOOD = { summary: "A summary.", topics: ["x"], tags: ["y"], tweet: "Read this" };

function makeCtx(opts: { key?: string | null; seo?: { description: string | null } | null } = {}) {
	const kv = new Map<string, unknown>();
	const live: Record<string, unknown> = { id: "p1", data: {} };
	if (opts.seo !== null) live.seo = opts.seo ?? { description: null };
	const ctx = {
		kv: {
			get: vi.fn(async (k: string) => kv.get(k) ?? null),
			set: vi.fn(async (k: string, v: unknown) => void kv.set(k, v)),
			delete: vi.fn(async (k: string) => kv.delete(k)),
			list: vi.fn(async (prefix: string) =>
				[...kv].filter(([k]) => k.startsWith(prefix)).map(([key, value]) => ({ key, value })),
			),
		},
		settings: { get: vi.fn(async () => (opts.key === undefined ? "sk-test" : opts.key)) },
		http: {
			fetch: vi.fn(async (_url: string, _init?: RequestInit): Promise<Response> => toolReply(GOOD)),
		},
		content: {
			get: vi.fn(async () => live),
			update: vi.fn(async () => live),
		},
		log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
	};
	return { ctx, kv, asCtx: ctx as unknown as PluginContext };
}

function setup(options: EnrichkitOptions = {}) {
	const plugin = createPlugin(options);
	const hook = plugin.hooks["content:afterPublish"]!;
	const publish = (ctx: PluginContext, data: Record<string, unknown>, id = "p1") =>
		(hook.handler as (e: unknown, c: PluginContext) => Promise<void>)(
			{ content: { id, data }, collection: "posts" },
			ctx,
		);
	return { plugin, hook, publish };
}

const POST = { title: "Hello", content: pt(words(150)) };

describe("descriptor", () => {
	it("is native and points at the package", () => {
		const d = enrichkitPlugin({ provider: "openai" });
		expect(d.format).toBe("native");
		expect(d.entrypoint).toBe("@plugdash/enrichkit");
		expect(d.options).toEqual({ provider: "openai" });
	});
});

describe("createPlugin", () => {
	it("listens to afterPublish only, never afterSave (autosaves make 0 calls)", () => {
		const { plugin } = setup();
		expect(Object.keys(plugin.hooks)).toEqual(["content:afterPublish"]);
	});

	it("sets the hook timeout to timeoutMs + 5000", () => {
		expect(setup().hook.timeout).toBe(35000);
		expect(setup({ timeoutMs: 1000 }).hook.timeout).toBe(6000);
	});

	it("allows only the chosen provider host and declares a secret apiKey setting", () => {
		expect(setup().plugin.allowedHosts).toEqual(["api.anthropic.com"]);
		expect(setup({ provider: "openai" }).plugin.allowedHosts).toEqual(["api.openai.com"]);
		expect(setup().plugin.admin.settingsSchema?.apiKey?.type).toBe("secret");
	});
});

describe("publish", () => {
	beforeEach(() => vi.useRealTimers());

	it("makes one call for the same content published twice", async () => {
		const { publish } = setup();
		const { ctx, kv, asCtx } = makeCtx();
		await publish(asCtx, POST);
		await publish(asCtx, POST);
		expect(ctx.http.fetch).toHaveBeenCalledTimes(1);
		expect(ctx.log.info).toHaveBeenCalledWith(
			"content unchanged since last enrichment, skipping",
			expect.anything(),
		);
		const result = kv.get("result:p1") as Record<string, unknown>;
		expect(result).toMatchObject({ ...GOOD, model: "claude-haiku-4-5", collection: "posts" });
		expect(result.hash).toMatch(/^[0-9a-f]{64}$/);
	});

	it("calls again when the body changes", async () => {
		const { publish } = setup();
		const { ctx, asCtx } = makeCtx();
		await publish(asCtx, POST);
		await publish(asCtx, { ...POST, content: pt(words(160)) });
		expect(ctx.http.fetch).toHaveBeenCalledTimes(2);
	});

	it("skips short content without a call", async () => {
		const { publish } = setup();
		const { ctx, asCtx } = makeCtx();
		await publish(asCtx, { title: "Hi", content: pt(words(20)) });
		expect(ctx.http.fetch).not.toHaveBeenCalled();
	});

	it("reads the field option for the body", async () => {
		const { publish } = setup({ field: "story" });
		const { ctx, asCtx } = makeCtx();
		await publish(asCtx, { title: "T", content: pt(words(150)), story: pt("too short") });
		expect(ctx.http.fetch).not.toHaveBeenCalled();
	});

	it("makes no second call on a bad reply", async () => {
		const { publish } = setup();
		const { ctx, kv, asCtx } = makeCtx();
		ctx.http.fetch.mockResolvedValue(
			new Response(JSON.stringify({ content: [{ type: "text", text: "sorry" }] }), { status: 200 }),
		);
		await publish(asCtx, POST);
		expect(ctx.http.fetch).toHaveBeenCalledTimes(1);
		expect(ctx.log.error).toHaveBeenCalledWith(
			"could not read the provider response, not retrying",
			expect.anything(),
		);
		expect(kv.has("result:p1")).toBe(false);
	});

	it("makes no retry on 429", async () => {
		const { publish } = setup();
		const { ctx, asCtx } = makeCtx();
		ctx.http.fetch.mockResolvedValue(new Response("{}", { status: 429 }));
		await publish(asCtx, POST);
		expect(ctx.http.fetch).toHaveBeenCalledTimes(1);
		expect(ctx.log.error.mock.calls[0]![0]).toMatch(/rate limited.*no retry/);
	});

	it("aborts the request after timeoutMs", async () => {
		const { publish } = setup({ timeoutMs: 20 });
		const { ctx, asCtx } = makeCtx();
		ctx.http.fetch.mockImplementation(
			(_url: string, init?: RequestInit) =>
				new Promise<Response>((_, reject) =>
					init?.signal?.addEventListener("abort", () => reject(new Error("aborted"))),
				),
		);
		await publish(asCtx, POST);
		expect(ctx.log.error).toHaveBeenCalledWith("provider request timed out", { timeoutMs: 20 });
	});

	it("logs a clear message when the host is blocked", async () => {
		const { publish } = setup();
		const { ctx, asCtx } = makeCtx();
		ctx.http.fetch.mockRejectedValue(
			new Error('Plugin "enrichkit" is not allowed to fetch from host "api.anthropic.com"'),
		);
		await publish(asCtx, POST);
		expect(ctx.log.error).toHaveBeenCalledWith(
			"host api.anthropic.com not in allowedHosts; set provider in astro.config.mjs or add it to allowedHosts",
		);
	});

	it("fills an empty seo.description with a seo-only update", async () => {
		const { publish } = setup();
		const { ctx, asCtx } = makeCtx();
		await publish(asCtx, POST);
		expect(ctx.content.update).toHaveBeenCalledWith("posts", "p1", {
			seo: { description: "A summary." },
		});
	});

	it("leaves an existing seo.description alone, and skips collections without seo", async () => {
		for (const seo of [{ description: "Mine" }, null]) {
			const { publish } = setup();
			const { ctx, asCtx } = makeCtx({ seo });
			await publish(asCtx, POST);
			expect(ctx.content.update).not.toHaveBeenCalled();
		}
	});

	it("does not touch seo when writeSeoDescription is false", async () => {
		const { publish } = setup({ writeSeoDescription: false });
		const { ctx, asCtx } = makeCtx();
		await publish(asCtx, POST);
		expect(ctx.content.update).not.toHaveBeenCalled();
	});

	it("skips without a key and does not call", async () => {
		const { publish } = setup();
		const { ctx, asCtx } = makeCtx({ key: null });
		await publish(asCtx, POST);
		expect(ctx.http.fetch).not.toHaveBeenCalled();
	});

	it("prefers the settings key and falls back to the option with one warning", async () => {
		const { publish } = setup({ apiKey: "sk-option" });
		const a = makeCtx();
		await publish(a.asCtx, POST);
		const init = a.ctx.http.fetch.mock.calls[0]![1] as RequestInit;
		expect((init.headers as Record<string, string>)["x-api-key"]).toBe("sk-test");

		const b = makeCtx({ key: null });
		await publish(b.asCtx, POST);
		await publish(b.asCtx, { ...POST, title: "Changed" });
		expect(b.ctx.http.fetch).toHaveBeenCalledTimes(2);
		const init2 = b.ctx.http.fetch.mock.calls[0]![1] as RequestInit;
		expect((init2.headers as Record<string, string>)["x-api-key"]).toBe("sk-option");
		expect(b.ctx.log.warn).toHaveBeenCalledTimes(1);
	});
});

describe("admin route", () => {
	it("shows the latest result and regenerates on demand", async () => {
		const { plugin, publish } = setup();
		const { ctx, asCtx } = makeCtx();
		ctx.content.get.mockResolvedValue({ id: "p1", data: POST, seo: { description: "x" } } as never);
		await publish(asCtx, POST);

		const route = plugin.routes.admin!;
		const call = (input: unknown) =>
			(route.handler as (c: unknown) => Promise<{ blocks: unknown[]; toast?: unknown }>)({
				...ctx,
				input,
			});

		const page = await call({ type: "page_load", page: "/" });
		expect(JSON.stringify(page.blocks)).toContain("A summary.");
		expect(JSON.stringify(page.blocks)).toContain('"action_id":"regenerate"');

		const regen = await call({
			type: "block_action",
			action_id: "regenerate",
			value: { id: "p1", collection: "posts" },
		});
		expect(ctx.http.fetch).toHaveBeenCalledTimes(2);
		expect(regen.toast).toEqual({ message: "Regenerated", type: "success" });
	});
});
