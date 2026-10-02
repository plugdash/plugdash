import { definePlugin, PluginRouteError } from "emdash";
import type { PluginContext, RouteContext } from "emdash";
import type { PluginDescriptor } from "@plugdash/types";
import pkg from "../package.json" with { type: "json" };

const ID = "heartpost";
const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/i;
const OLD_VISITOR_ROW = /^heartpost:.+:[0-9a-f]{16}$/;
const MAX_TRIES = 5;

export interface HeartpostConfig {
	/** Collections whose entries can be hearted. Default: ["posts"]. */
	collections?: string[];
	/** Hearts or un-hearts per IP per minute. 0 turns the limit off. Default: 10. */
	rateLimitPerMinute?: number;
	/** Header holding the real client IP, for example "x-real-ip". Default: EmDash's own requestMeta.ip. */
	trustProxyHeader?: string | null;
	/** Word shown on the admin page. Default: "hearts". */
	label?: string;
}

export function getOptions(c: HeartpostConfig = {}) {
	const rate = c.rateLimitPerMinute;
	return {
		collections:
			Array.isArray(c.collections) && c.collections.length > 0 ? c.collections : ["posts"],
		rateLimitPerMinute: typeof rate === "number" && rate >= 0 ? Math.floor(rate) : 10,
		trustProxyHeader: typeof c.trustProxyHeader === "string" ? c.trustProxyHeader : null,
		label: typeof c.label === "string" && c.label.trim() ? c.label.trim() : "hearts",
	};
}

export function heartpostPlugin(config: HeartpostConfig = {}): PluginDescriptor<HeartpostConfig> {
	return {
		id: ID,
		version: pkg.version,
		format: "native",
		entrypoint: "@plugdash/heartpost",
		options: config,
		capabilities: ["content:read"],
		storage: { hits: { indexes: ["bucket"] } },
	};
}

// ── helpers ──

const warned = new Set<string>();
function warnOnce(ctx: PluginContext, key: string, message: string) {
	if (warned.has(key)) return;
	warned.add(key);
	ctx.log.warn(message);
}

async function sha256Hex(text: string): Promise<string> {
	const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
	return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join("");
}

interface Versioned<T> {
	value: T;
	revision: string;
}

/** Read-modify-write on a versioned doc, retried when another request wins the race. */
export async function casUpdate<T>(
	read: () => Promise<Versioned<T> | null>,
	write: (rev: string | null, v: T) => Promise<{ applied: boolean }>,
	next: (current: T | null) => T,
): Promise<T> {
	for (let i = 0; i < MAX_TRIES; i++) {
		const cur = await read();
		const value = next(cur ? cur.value : null);
		if ((await write(cur ? cur.revision : null, value)).applied) return value;
	}
	throw new PluginRouteError("BUSY", "Too many concurrent hearts, try again", 503);
}

/** Trusted client IP, or null when there is none (plain local node). */
export function clientIp(route: RouteContext, header: string | null): string | null {
	if (header) return route.request.headers.get(header)?.split(",")[0]?.trim() || null;
	return route.requestMeta?.ip ?? null;
}

async function rateLimit(ctx: PluginContext, ip: string, limit: number) {
	const hits = ctx.storage.hits;
	if (!hits) return;
	const minute = Math.floor(Date.now() / 60_000);
	const id = `${await sha256Hex(ip)}:${minute}`;
	const doc = await casUpdate<{ bucket: number; n: number }>(
		() => hits.getVersioned(id) as Promise<Versioned<{ bucket: number; n: number }> | null>,
		(rev, v) => hits.compareAndSet(id, rev, v),
		(cur) => ({ bucket: minute, n: (cur?.n ?? 0) + 1 }),
	);
	if (doc.n > limit) throw new PluginRouteError("RATE_LIMITED", "Slow down", 429);
	// bounded cleanup: drop up to 100 stale buckets per write
	const old = await hits.query({ where: { bucket: { lt: minute - 10 } }, limit: 100 });
	if (old.items.length) await hits.deleteMany(old.items.map((i) => i.id));
}

/** A published entry with this id in an allowed collection, or null. */
async function findPublished(ctx: PluginContext, collections: string[], id: string) {
	for (const c of collections) {
		const entry = (await ctx.content?.get(c, id)) as { status?: string; slug?: string } | null;
		if (entry && entry.status === "published") return entry;
	}
	return null;
}

/** Count left by 0.2.x under the ULID or the slug. */
async function legacyCount(ctx: PluginContext, id: string, legacyId: string | null) {
	const keys = [`heartpost:${id}:count`, ...(legacyId ? [`heartpost:${legacyId}:count`] : [])];
	let best = 0;
	for (const k of keys) {
		const v = await ctx.kv.get<number>(k);
		if (typeof v === "number" && v > best) best = v;
	}
	return best;
}

function readIds(input: unknown) {
	const i = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
	const id = typeof i.id === "string" ? i.id : "";
	const legacyId = typeof i.legacyId === "string" && i.legacyId ? i.legacyId : null;
	return { id, legacyId };
}

// ── runtime plugin ──

export function createPlugin(rawOptions: HeartpostConfig = {}) {
	const options = getOptions(rawOptions);

	async function change(route: RouteContext, delta: 1 | -1) {
		const ctx = route as PluginContext;
		const { id, legacyId } = readIds(route.input);
		if (!ULID.test(id)) throw PluginRouteError.badRequest("id must be an entry id");
		const key = `count:${id}`;

		let base = 0;
		if (!(await ctx.kv.getVersioned<number>(key))) {
			const entry = await findPublished(ctx, options.collections, id);
			if (!entry) throw PluginRouteError.notFound("No published entry with that id");
			// only trust legacyId when it really is this entry's slug
			base = await legacyCount(ctx, id, entry.slug && entry.slug === legacyId ? legacyId : null);
			if (delta < 0 && base === 0) return { count: 0 };
		}

		if (options.rateLimitPerMinute > 0) {
			const ip = clientIp(route, options.trustProxyHeader);
			if (ip) await rateLimit(ctx, ip, options.rateLimitPerMinute);
			else warnOnce(ctx, "ip", "no trusted client IP on this request, rate limiting is off");
		}

		const count = await casUpdate<number>(
			() => ctx.kv.getVersioned<number>(key),
			(rev, v) => ctx.kv.compareAndSet(key, rev, v),
			(cur) => Math.max(0, (cur ?? base) + delta),
		);
		return { count };
	}

	return definePlugin({
		id: ID,
		version: pkg.version,
		capabilities: ["content:read"],
		storage: { hits: { indexes: ["bucket"] } },
		admin: { pages: [{ path: "/", label: "Heart Post", icon: "heart" }] },
		hooks: {},
		routes: {
			"heart-status": {
				public: true,
				handler: async (route) => {
					const ctx = route as PluginContext;
					const url = new URL(route.request.url);
					const id = url.searchParams.get("id") ?? "";
					if (!ULID.test(id)) return { count: 0 };
					const count = await ctx.kv.get<number>(`count:${id}`);
					if (typeof count === "number") return { count };
					// not migrated yet: show the 0.2.x count, read-only
					return { count: await legacyCount(ctx, id, url.searchParams.get("legacyId")) };
				},
			},
			heart: { public: true, handler: (route) => change(route, 1) },
			"heart-remove": { public: true, handler: (route) => change(route, -1) },

			admin: {
				handler: async (route) => {
					const ctx = route as PluginContext;
					const input = (route.input ?? {}) as { type?: string; action_id?: string };
					let toast: { message: string; type: string } | undefined;
					if (input.type === "block_action" && input.action_id === "remove_old_rows") {
						const rows = await ctx.kv.list("heartpost:");
						const old = rows.filter((r) => OLD_VISITOR_ROW.test(r.key)).map((r) => r.key);
						for (let i = 0; i < old.length; i += 500) {
							await Promise.all(old.slice(i, i + 500).map((k) => ctx.kv.delete(k)));
						}
						toast = { message: `Removed ${old.length} old visitor rows`, type: "success" };
					}
					return {
						blocks: [
							{ type: "header", text: "Heart Post" },
							{
								type: "context",
								text: `Keeps one ${options.label} count per post. Versions before 0.3 also wrote one row per visitor. Remove them here.`,
							},
							{
								type: "actions",
								elements: [
									{
										type: "button",
										text: "Remove old visitor rows",
										action_id: "remove_old_rows",
										style: "danger",
										confirm: {
											title: "Remove old visitor rows?",
											text: "Deletes the per-visitor rows from 0.2.x. Counts are kept.",
											confirm: "Remove",
											deny: "Cancel",
										},
									},
								],
							},
						],
						...(toast ? { toast } : {}),
					};
				},
			},
		},
	});
}

export default createPlugin;
