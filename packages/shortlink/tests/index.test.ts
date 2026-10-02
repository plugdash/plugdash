import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	createPlugin,
	getOptions,
	normalizePrefix,
	shortCode,
	shortlinkPlugin,
	shortPath,
} from "../src/index.ts";

const ULID = "01J9ZQ3V8R5K7M2N4P6Q8S0T1W";
const OTHER = "01JAAAAAAAAAAAAAAA6Q8S0T1W"; // same last 8 chars as ULID

interface Row {
	id: string;
	source: string;
	destination: string;
	type: number;
	groupName: string | null;
	rev: number;
}

// Small in-memory stand-in for the parts of PluginContext the hook uses.
function makeCtx(opts: { publicUrl?: string | null; urlPattern?: string | null } = {}) {
	const rows: Row[] = [];
	const kv = new Map<string, unknown>();
	let next = 1;
	const redirects = {
		list: vi.fn(async ({ search = "" }: { search?: string } = {}) => ({
			items: rows.filter((r) => r.source.includes(search) || r.destination.includes(search)),
		})),
		get: vi.fn(async (id: string) => {
			const r = rows.find((x) => x.id === id);
			return r ? { redirect: r, _rev: String(r.rev) } : null;
		}),
		create: vi.fn(async (input: Omit<Row, "id" | "rev">) => {
			const r = { id: String(next++), rev: 1, ...input } as Row;
			rows.push(r);
			return { redirect: r, _rev: "1" };
		}),
		update: vi.fn(async (id: string, input: { destination: string; _rev: string }) => {
			const r = rows.find((x) => x.id === id)!;
			if (input._rev !== String(r.rev)) throw new Error("stale _rev");
			r.destination = input.destination;
			r.rev++;
			return { redirect: r, _rev: String(r.rev) };
		}),
	};
	const ctx = {
		log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
		kv: {
			get: vi.fn(async (k: string) => (kv.has(k) ? kv.get(k) : null)),
			set: vi.fn(async (k: string, v: unknown) => void kv.set(k, v)),
		},
		content: {
			getPublicUrl: vi.fn(async () => opts.publicUrl ?? null),
		},
		schema: {
			getCollection: vi.fn(async () => ({
				routable: true,
				urlPattern: opts.urlPattern === undefined ? "/posts/{slug}" : opts.urlPattern,
			})),
		},
		redirects,
	};
	return { ctx, rows, kv };
}

async function publish(
	ctx: unknown,
	content: Record<string, unknown>,
	options = {},
	collection = "posts",
) {
	const hook = createPlugin(options).hooks["content:afterPublish"]!;
	await hook.handler({ content, collection } as never, ctx as never);
}

describe("shortCode", () => {
	it("is the last 8 chars of the id, lowercased, and stable", () => {
		expect(shortCode(ULID)).toBe("6q8s0t1w");
		expect(shortCode(ULID)).toBe(shortCode(ULID));
	});

	it("builds the short path with a normalised prefix", () => {
		expect(shortPath(ULID)).toBe(`/s/${shortCode(ULID)}`);
		expect(shortPath(ULID, "go")).toBe(`/go/${shortCode(ULID)}`);
		expect(normalizePrefix("/l//")).toBe("/l/");
	});
});

describe("descriptor and options", () => {
	it("is a native descriptor that carries the options", () => {
		expect(shortlinkPlugin({ prefix: "/go/" })).toMatchObject({
			id: "shortlink",
			format: "native",
			entrypoint: "@plugdash/shortlink",
			options: { prefix: "/go/" },
		});
	});

	it("fills defaults", () => {
		expect(getOptions()).toEqual({ prefix: "/s/", pathPattern: "/{collection}/{slug}" });
	});

	it("declares redirects:write and only hooks afterPublish", () => {
		const plugin = createPlugin();
		expect(plugin.capabilities).toEqual(
			expect.arrayContaining(["content:read", "schema:read", "redirects:write"]),
		);
		expect(Object.keys(plugin.hooks)).toEqual(["content:afterPublish"]);
	});
});

describe("afterPublish", () => {
	let t: ReturnType<typeof makeCtx>;
	beforeEach(() => {
		t = makeCtx();
	});

	it("creates a 301 in group shortlink using the collection urlPattern", async () => {
		await publish(t.ctx, { id: ULID, slug: "hello" });
		expect(t.rows).toHaveLength(1);
		expect(t.rows[0]).toMatchObject({
			source: `/s/${shortCode(ULID)}`,
			destination: "/posts/hello",
			type: 301,
			groupName: "shortlink",
		});
	});

	it("uses only the path of getPublicUrl, never the stored origin", async () => {
		t = makeCtx({ publicUrl: "http://stale-dev-host:5120/blog/2026/hello/" });
		await publish(t.ctx, { id: ULID, slug: "hello" });
		expect(t.rows[0]!.destination).toBe("/blog/2026/hello/");
	});

	it("falls back to pathPattern when the collection has no urlPattern", async () => {
		t = makeCtx({ urlPattern: null });
		await publish(t.ctx, { id: ULID, slug: "hello" }, { pathPattern: "/{collection}/{id}" });
		expect(t.rows[0]!.destination).toBe(`/posts/${ULID}`);
	});

	it("is idempotent on republish", async () => {
		await publish(t.ctx, { id: ULID, slug: "hello" });
		await publish(t.ctx, { id: ULID, slug: "hello" });
		expect(t.rows).toHaveLength(1);
		expect(t.ctx.redirects.update).not.toHaveBeenCalled();
	});

	it("updates the destination with _rev when the slug changes", async () => {
		await publish(t.ctx, { id: ULID, slug: "hello" });
		await publish(t.ctx, { id: ULID, slug: "hello-again" });
		expect(t.rows).toHaveLength(1);
		expect(t.rows[0]!.destination).toBe("/posts/hello-again");
		expect(t.ctx.redirects.update).toHaveBeenCalledWith("1", {
			destination: "/posts/hello-again",
			_rev: "1",
		});
	});

	it("on collision logs both entry ids and does not overwrite", async () => {
		await publish(t.ctx, { id: OTHER, slug: "first" });
		await publish(t.ctx, { id: ULID, slug: "second" });
		expect(t.rows).toHaveLength(1);
		expect(t.rows[0]!.destination).toBe("/posts/first");
		expect(t.ctx.redirects.update).not.toHaveBeenCalled();
		expect(t.ctx.log.error).toHaveBeenCalledWith(
			expect.stringContaining("collision"),
			expect.objectContaining({ entryId: ULID, ownerEntryId: OTHER }),
		);
	});

	it("does not overwrite a redirect someone added by hand", async () => {
		await t.ctx.redirects.create({
			source: `/s/${shortCode(ULID)}`,
			destination: "/somewhere",
			type: 302,
			groupName: null,
		});
		await publish(t.ctx, { id: ULID, slug: "hello" });
		expect(t.rows[0]!.destination).toBe("/somewhere");
		expect(t.ctx.log.error).toHaveBeenCalled();
	});

	it("migration: creates a redirect for the old 0.2.x code too", async () => {
		t.kv.set(`shortlink:by-content:${ULID}`, "Ab3x");
		await publish(t.ctx, { id: ULID, slug: "hello" });
		expect(t.rows.map((r) => [r.source, r.destination])).toEqual([
			[`/s/${shortCode(ULID)}`, "/posts/hello"],
			["/s/Ab3x", "/posts/hello"],
		]);
	});

	it("uses the prefix option", async () => {
		await publish(t.ctx, { id: ULID, slug: "hello" }, { prefix: "go" });
		expect(t.rows[0]!.source).toBe(`/go/${shortCode(ULID)}`);
	});

	it("skips collections that are not routable", async () => {
		t.ctx.schema.getCollection.mockResolvedValueOnce({ routable: false, urlPattern: null });
		await publish(t.ctx, { id: ULID, slug: "hello" });
		expect(t.rows).toHaveLength(0);
	});

	it("never throws to the host", async () => {
		t.ctx.redirects.list.mockRejectedValueOnce(new Error("db down"));
		await expect(publish(t.ctx, { id: ULID, slug: "hello" })).resolves.toBeUndefined();
		expect(t.ctx.log.error).toHaveBeenCalledWith("afterPublish failed", expect.anything());
	});

	it("warns once when redirects:write is not available", async () => {
		const { ctx } = makeCtx();
		const noRedirects = { ...ctx, redirects: undefined };
		await publish(noRedirects, { id: ULID, slug: "a" });
		await publish(noRedirects, { id: ULID, slug: "a" });
		expect(ctx.log.warn).toHaveBeenCalledTimes(1);
	});
});
