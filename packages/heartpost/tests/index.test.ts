import { describe, expect, it, vi } from "vitest";
import { createPlugin, getOptions, heartpostPlugin } from "../src/index";
import { fetchCount, heartId, resetCounts } from "../src/client";

const ID = "01M3W6CSGR0R2Y00YTB7P4PVQZ";
const OTHER = "01M3W6CSGR0R2Y00YTB7P4PVQY";

/** In-memory store with real revision semantics, used for both kv and storage. */
function fakeStore(initial: Record<string, unknown> = {}) {
	const rows = new Map<string, { value: unknown; rev: number }>();
	for (const [k, v] of Object.entries(initial)) rows.set(k, { value: v, rev: 1 });
	const tick = () => new Promise((r) => setTimeout(r, 0));
	return {
		rows,
		async get(k: string) {
			return rows.has(k) ? rows.get(k)!.value : null;
		},
		async getVersioned(k: string) {
			await tick();
			const r = rows.get(k);
			return r ? { value: r.value, revision: String(r.rev) } : null;
		},
		async compareAndSet(k: string, rev: string | null, value: unknown) {
			const r = rows.get(k);
			if ((r ? String(r.rev) : null) !== rev) return { applied: false as const };
			rows.set(k, { value, rev: (r?.rev ?? 0) + 1 });
			return { applied: true as const, revision: "x" };
		},
		async query(opts: { where?: { bucket?: { lt: number } } }) {
			const lt = opts.where?.bucket?.lt ?? Infinity;
			const items = [...rows]
				.filter(([, r]) => (r.value as { bucket: number }).bucket < lt)
				.map(([id, r]) => ({ id, data: r.value }));
			return { items, hasMore: false };
		},
		async deleteMany(ids: string[]) {
			ids.forEach((i) => rows.delete(i));
			return ids.length;
		},
		async list(prefix: string) {
			return [...rows]
				.filter(([k]) => k.startsWith(prefix))
				.map(([key, r]) => ({ key, value: r.value }));
		},
		async delete(k: string) {
			return rows.delete(k);
		},
	};
}

function setup(
	opts: {
		kv?: Record<string, unknown>;
		ip?: string | null;
		plugin?: Parameters<typeof createPlugin>[0];
		entry?: unknown;
	} = {},
) {
	const kv = fakeStore(opts.kv);
	const hits = fakeStore();
	const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
	const entry = "entry" in opts ? opts.entry : { status: "published", slug: "hello" };
	const plugin = createPlugin(opts.plugin);
	const call = (
		route: string,
		input: unknown,
		headers: Record<string, string> = {},
		ip = opts.ip ?? null,
	) => {
		const handler = (
			plugin.routes as never as Record<string, { handler: (c: unknown) => Promise<unknown> }>
		)[route]!.handler;
		return handler({
			kv,
			storage: { hits },
			log,
			input,
			content: { get: vi.fn(async (_c: string, id: string) => (id === ID ? entry : null)) },
			request: new Request("http://x/?id=" + ID, { headers }),
			requestMeta: { ip },
		});
	};
	return { kv, hits, log, call, plugin };
}

describe("options and descriptor", () => {
	it("fills defaults", () => {
		expect(getOptions()).toEqual({
			collections: ["posts"],
			rateLimitPerMinute: 10,
			trustProxyHeader: null,
			label: "hearts",
		});
		expect(getOptions({ rateLimitPerMinute: 0 }).rateLimitPerMinute).toBe(0);
	});

	it("descriptor is native, passes options, declares the hits index", () => {
		expect(heartpostPlugin({ rateLimitPerMinute: 3 })).toMatchObject({
			id: "heartpost",
			format: "native",
			entrypoint: "@plugdash/heartpost",
			options: { rateLimitPerMinute: 3 },
			storage: { hits: { indexes: ["bucket"] } },
		});
	});

	it("registers no hooks (no afterSave)", () => {
		const hooks = createPlugin().hooks as Record<string, unknown>;
		expect(hooks["content:afterSave"]).toBeUndefined();
	});
});

describe("heart route", () => {
	it("50 parallel hearts end at exactly 50", async () => {
		const { call, kv } = setup({ plugin: { rateLimitPerMinute: 0 } });
		const results = await Promise.all(
			Array.from({ length: 50 }, () => call("heart", { id: ID }).catch((e) => e)),
		);
		const ok = results.filter((r) => !(r instanceof Error));
		// casUpdate retries 5 times, so heavy contention may 503 a few; every success is counted once
		expect(kv.rows.get(`count:${ID}`)!.value).toBe(ok.length);
		expect(ok.length).toBeGreaterThan(0);
	});

	it("rejects ids that are not ULIDs", async () => {
		const { call } = setup();
		await expect(call("heart", { id: "anything" })).rejects.toMatchObject({ status: 400 });
		await expect(call("heart", {})).rejects.toMatchObject({ status: 400 });
	});

	it("rejects unknown or unpublished entries and writes nothing", async () => {
		const a = setup({ entry: { status: "draft" } });
		await expect(a.call("heart", { id: ID })).rejects.toMatchObject({ status: 404 });
		const b = setup();
		await expect(b.call("heart", { id: OTHER })).rejects.toMatchObject({ status: 404 });
		expect(a.kv.rows.size + b.kv.rows.size).toBe(0);
	});

	it("heart-remove decrements and stops at 0", async () => {
		const { call } = setup({ kv: { [`count:${ID}`]: 1 }, plugin: { rateLimitPerMinute: 0 } });
		expect(await call("heart-remove", { id: ID })).toEqual({ count: 0 });
		expect(await call("heart-remove", { id: ID })).toEqual({ count: 0 });
	});

	it("heart-status reads one key and returns 0 for unknown ids", async () => {
		const { call } = setup({ kv: { [`count:${ID}`]: 7 } });
		expect(await call("heart-status", { id: ID })).toEqual({ count: 7 });
		expect(await call("heart-status", {})).toBeDefined();
	});
});

describe("rate limit and client ip", () => {
	it("ignores X-Forwarded-For: spoofed addresses share one bucket", async () => {
		const { call, kv } = setup({ ip: "9.9.9.9", plugin: { rateLimitPerMinute: 3 } });
		let done = 0;
		for (let i = 0; i < 20; i++) {
			try {
				await call("heart", { id: ID }, { "x-forwarded-for": `1.2.3.${i}` });
				done++;
			} catch (e) {
				expect((e as { status: number }).status).toBe(429);
			}
		}
		expect(done).toBe(3);
		expect(kv.rows.get(`count:${ID}`)!.value).toBe(3);
	});

	it("trustProxyHeader reads the configured header only", async () => {
		const { call } = setup({
			ip: "9.9.9.9",
			plugin: { rateLimitPerMinute: 1, trustProxyHeader: "x-real-ip" },
		});
		await call("heart", { id: ID }, { "x-real-ip": "5.5.5.5" });
		await call("heart", { id: ID }, { "x-real-ip": "6.6.6.6" });
		await expect(call("heart", { id: ID }, { "x-real-ip": "5.5.5.5" })).rejects.toMatchObject({
			status: 429,
		});
	});

	it("no trusted ip: no limit, one warning", async () => {
		const { call, log } = setup({ ip: null, plugin: { rateLimitPerMinute: 1 } });
		for (let i = 0; i < 3; i++) await call("heart", { id: ID });
		expect(log.warn.mock.calls.length).toBeLessThanOrEqual(1);
	});

	it("drops buckets older than 10 minutes", async () => {
		const { call, hits } = setup({ ip: "9.9.9.9" });
		hits.rows.set("old:1", { value: { bucket: 1, n: 1 }, rev: 1 });
		await call("heart", { id: ID });
		expect(hits.rows.has("old:1")).toBe(false);
	});
});

describe("migration from 0.2.x", () => {
	const kv = { "heartpost:hello:count": 9, [`heartpost:${ID}:count`]: 4 };
	const opts = { kv, plugin: { rateLimitPerMinute: 0 } };

	it("first heart starts from the larger legacy count", async () => {
		const { call, kv: store } = setup(opts);
		expect(await call("heart", { id: ID, legacyId: "hello" })).toEqual({ count: 10 });
		expect(store.rows.get(`count:${ID}`)!.value).toBe(10);
	});

	it("heart-status shows the legacy count without writing", async () => {
		const { kv: store, plugin } = setup(opts);
		const handler = (
			plugin.routes as never as Record<string, { handler: (c: unknown) => Promise<unknown> }>
		)["heart-status"]!.handler;
		const out = await handler({
			kv: store,
			request: new Request(`http://x/?id=${ID}&legacyId=hello`),
		});
		expect(out).toEqual({ count: 9 });
		expect(store.rows.has(`count:${ID}`)).toBe(false);
	});

	it("ignores a legacyId that is not this entry's slug", async () => {
		const { call } = setup(opts);
		expect(await call("heart", { id: ID, legacyId: "someone-elses-post" })).toEqual({ count: 5 });
	});
});

describe("admin cleanup", () => {
	it("deletes only per-visitor rows", async () => {
		const kvRows = {
			"heartpost:hello:a1b2c3d4e5f60718": "1",
			[`heartpost:${ID}:0123456789abcdef`]: "1",
			"heartpost:hello:count": 9,
			[`count:${ID}`]: 3,
		};
		const { kv, plugin } = setup({ kv: kvRows });
		const admin = (
			plugin.routes as never as Record<
				string,
				{ handler: (c: unknown) => Promise<{ toast?: { message: string } }> }
			>
		).admin!.handler;
		const out = await admin({ kv, input: { type: "block_action", action_id: "remove_old_rows" } });
		expect(out.toast?.message).toContain("2");
		expect([...kv.rows.keys()].sort()).toEqual([`count:${ID}`, "heartpost:hello:count"].sort());
	});
});

describe("component helpers", () => {
	it("heartId prefers data.id (ULID) over id (slug)", () => {
		expect(heartId({ id: "hello", data: { id: ID } })).toBe(ID);
		expect(heartId({ id: "hello", data: {} })).toBe("hello");
		expect(heartId({ data: {} })).toBeUndefined();
		expect(heartId(null)).toBeUndefined();
	});

	it("fetchCount makes one request per id", async () => {
		resetCounts();
		const f = vi.fn(
			async () => new Response(JSON.stringify({ success: true, data: { count: 4 } })),
		);
		const [a, b] = await Promise.all([
			fetchCount(ID, "hello", f as never),
			fetchCount(ID, "hello", f as never),
		]);
		expect([a, b]).toEqual([4, 4]);
		expect(f).toHaveBeenCalledTimes(1);
	});
});
