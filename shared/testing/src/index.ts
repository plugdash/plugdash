// @plugdash/testing - Mock context factories for plugin tests
//
// Behaviour is modelled on EmDash 1.0.1 (node_modules/emdash/src):
//   kv/settings   plugins/context.ts createKVAccess, plugins/types.ts KVAccess
//   content       database/repositories/content.ts updateDraftAware
//   http          plugins/context.ts createHttpAccess
//   hooks         plugins/hooks.ts executeWithTimeout, plugins/adapt-sandbox-entry.ts
//   routes        plugins/routes.ts invoke, plugins/http-route-dispatch.ts

import { vi } from "vitest";
import type { PluginContext, ContentAccess } from "emdash";

type Row = Record<string, unknown>;
// biome-ignore lint: loose on purpose, these are test doubles
type AnyFn = (...args: any[]) => any;

/** Same name and message shape as emdash's EmDashValidationError. */
export class EmDashValidationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "EmDashValidationError";
	}
}

/** vi.fn that runs `impl`, so tests can still assert calls or override it. */
const fn = <T extends AnyFn>(impl: T) => vi.fn(impl) as unknown as T & ReturnType<typeof vi.fn>;

let counter = 0;
const nextRev = () => String(++counter);
const ulid = () =>
	"01" + (Date.now().toString(36) + (++counter).toString(36)).toUpperCase().padStart(24, "0");

function makeStore() {
	const map = new Map<string, { value: unknown; revision: string }>();
	const put = (key: string, value: unknown) => {
		const revision = nextRev();
		map.set(key, { value: structuredClone(value), revision });
		return revision;
	};
	return {
		map,
		get: async (key: string) => (map.has(key) ? structuredClone(map.get(key)!.value) : null),
		getVersioned: async (key: string) => {
			const e = map.get(key);
			return e ? { value: structuredClone(e.value), revision: e.revision } : null;
		},
		set: async (key: string, value: unknown) => void put(key, value),
		delete: async (key: string) => map.delete(key),
		compareAndSet: async (key: string, expected: string | null, value: unknown) => {
			const cur = map.get(key);
			if (expected === null ? cur : cur?.revision !== expected) return { applied: false as const };
			return { applied: true as const, revision: put(key, value) };
		},
		compareAndDelete: async (key: string, expected: string) => {
			if (map.get(key)?.revision !== expected) return { applied: false };
			map.delete(key);
			return { applied: true };
		},
		list: async (prefix = "") =>
			[...map]
				.filter(([k]) => k.startsWith(prefix))
				.map(([key, e]) => ({ key, value: structuredClone(e.value) })),
	};
}

function makeSettings(settingsSchema: Record<string, { type?: string }>) {
	const store = makeStore();
	return {
		...store,
		// get() returns null when unset. The schema default is NOT applied (EmDash fact 7).
		set: async (key: string, value: unknown) => {
			if (settingsSchema[key]?.type === "secret" && typeof value !== "string") {
				throw new Error("Plugin secret settings must be strings");
			}
			await store.set(key, value);
		},
	};
}

/** kv with the "settings:" alias that EmDash routes to ctx.settings. */
function makeKV(settings: ReturnType<typeof makeSettings>) {
	const store = makeStore();
	const A = "settings:";
	const pick = (key: string) =>
		(key.startsWith(A) ? [settings, key.slice(A.length)] : [store, key]) as [typeof store, string];
	return {
		get: (key: string) => (([s, k]) => s.get(k))(pick(key)),
		getVersioned: (key: string) => (([s, k]) => s.getVersioned(k))(pick(key)),
		set: (key: string, v: unknown) => (([s, k]) => s.set(k, v))(pick(key)),
		delete: (key: string) => (([s, k]) => s.delete(k))(pick(key)),
		compareAndSet: (key: string, e: string | null, v: unknown) =>
			(([s, k]) => s.compareAndSet(k, e, v))(pick(key)),
		compareAndDelete: (key: string, e: string) =>
			(([s, k]) => s.compareAndDelete(k, e))(pick(key)),
		list: async (prefix = "") => {
			const own = prefix.startsWith(A) ? [] : await store.list(prefix);
			if (!(A.startsWith(prefix) || prefix.startsWith(A))) return own;
			const sp = prefix.startsWith(A) ? prefix.slice(A.length) : "";
			const fromSettings = (await settings.list(sp)).map((e) => ({
				key: A + e.key,
				value: e.value,
			}));
			return [...own, ...fromSettings];
		},
	};
}

type WhereClause = Record<string, unknown>;
const matches = (row: Row, where?: WhereClause) =>
	Object.entries(where ?? {}).every(([k, v]) => row[k] === v);

function makeStorageCollection() {
	const store = makeStore();
	const rows = () => [...store.map].map(([id, e]) => ({ id, data: e.value as Row }));
	return {
		get: store.get,
		getVersioned: store.getVersioned,
		compareAndSet: store.compareAndSet,
		compareAndDelete: store.compareAndDelete,
		delete: store.delete,
		put: store.set,
		exists: async (id: string) => store.map.has(id),
		getMany: async (ids: string[]) => {
			const out = new Map<string, unknown>();
			for (const id of ids) if (store.map.has(id)) out.set(id, await store.get(id));
			return out;
		},
		putMany: async (items: Array<{ id: string; data: unknown }>) => {
			for (const i of items) await store.set(i.id, i.data);
		},
		deleteMany: async (ids: string[]) => {
			let n = 0;
			for (const id of ids) if (store.map.delete(id)) n++;
			return n;
		},
		query: async (
			o: { where?: WhereClause; orderBy?: Record<string, "asc" | "desc">; limit?: number } = {},
		) => {
			const items = rows().filter((r) => matches(r.data, o.where));
			for (const [f, dir] of Object.entries(o.orderBy ?? {}).reverse()) {
				items.sort(
					(a, b) =>
						(Number(a.data[f]! > b.data[f]!) - Number(a.data[f]! < b.data[f]!)) *
						(dir === "desc" ? -1 : 1),
				);
			}
			const limit = Math.min(o.limit ?? 50, 100);
			return { items: items.slice(0, limit), hasMore: items.length > limit };
		},
		count: async (where?: WhereClause) => rows().filter((r) => matches(r.data, where)).length,
	};
}

function makeRedirects() {
	const map = new Map<string, { redirect: Row; _rev: string }>();
	const build = (id: string, input: Row, old?: Row) => ({
		redirect: {
			id,
			source: "",
			destination: "",
			type: 301,
			isPattern: false,
			enabled: true,
			hits: 0,
			lastHitAt: null,
			groupName: null,
			auto: false,
			createdAt: new Date().toISOString(),
			...old,
			...input,
			updatedAt: new Date().toISOString(),
		},
		_rev: nextRev(),
	});
	return {
		create: async (input: Row) => {
			const id = ulid();
			const v = build(id, input);
			map.set(id, v);
			return structuredClone(v);
		},
		get: async (id: string) => (map.has(id) ? structuredClone(map.get(id)!) : null),
		list: async (
			o: { group?: string; search?: string; enabled?: boolean; limit?: number } = {},
		) => {
			const items = [...map.values()]
				.map((v) => v.redirect)
				.filter(
					(r) =>
						(o.group === undefined || r.groupName === o.group) &&
						(o.enabled === undefined || r.enabled === o.enabled) &&
						(!o.search ||
							String(r.source).includes(o.search) ||
							String(r.destination).includes(o.search)),
				);
			const limit = o.limit ?? 50;
			return { items: structuredClone(items.slice(0, limit)), hasMore: items.length > limit };
		},
		update: async (id: string, { _rev, ...input }: Row & { _rev?: string }) => {
			const cur = map.get(id);
			if (!cur || cur._rev !== _rev) throw new Error("Redirect revision mismatch");
			const v = build(id, input, cur.redirect);
			map.set(id, v);
			return structuredClone(v);
		},
		delete: async (id: string, { _rev }: { _rev: string }) =>
			map.get(id)?._rev === _rev && map.delete(id),
	};
}

function makeHttp(pluginId: string, allowedHosts: string[], fetchImpl: AnyFn) {
	const calls: Array<{ url: string; init?: RequestInit }> = [];
	const allowed = (host: string) =>
		allowedHosts.some((p) => {
			p = p.toLowerCase();
			if (p === "*") return true;
			if (p.startsWith("*.")) return host.endsWith(p.slice(1)) || host === p.slice(2);
			return host === p;
		});
	const doFetch = fn(async (url: string, init?: RequestInit) => {
		if (allowedHosts.length === 0) {
			throw new Error(
				`Plugin "${pluginId}" has no allowed hosts configured. Add hosts to the plugin's allowedHosts array to enable HTTP requests.`,
			);
		}
		const host = new URL(url).hostname.toLowerCase();
		if (!allowed(host)) {
			throw new Error(
				`Plugin "${pluginId}" is not allowed to fetch from host "${host}". Allowed hosts: ${allowedHosts.join(", ")}`,
			);
		}
		calls.push({ url, init });
		return fetchImpl(url, init);
	});
	return { fetch: doFetch, calls };
}

interface Doc {
	live: Row;
	draft: Row | null;
	item: Row;
}

function makeContent(
	schema: Record<string, string[]> | undefined,
	revisions: boolean,
	seed: Record<string, Row[]>,
) {
	const docs = new Map<string, Map<string, Doc>>();
	const col = (c: string) => {
		if (schema && !schema[c]) throw new Error(`Collection '${c}' not found`);
		if (!docs.has(c)) docs.set(c, new Map());
		return docs.get(c)!;
	};
	const view = (c: string, d: Doc): Row => ({ ...d.item, type: c, data: structuredClone(d.live) });
	const check = (c: string, data: Row) => {
		for (const f of Object.keys(data)) {
			if (schema && f !== "seo" && !schema[c]!.includes(f)) {
				throw new EmDashValidationError(`Unknown field '${f}' in collection '${c}'`);
			}
		}
	};
	const add = (c: string, row: Row) => {
		const { data = {}, ...rest } = row;
		const id = (rest.id as string) ?? ulid();
		const ts = new Date().toISOString();
		const item = {
			id,
			slug: id,
			status: "draft",
			createdAt: ts,
			updatedAt: ts,
			publishedAt: null,
			...rest,
		};
		col(c).set(id, { live: structuredClone(data) as Row, draft: null, item });
		return view(c, col(c).get(id)!);
	};
	const must = (c: string, id: string) => {
		const d = col(c).get(id);
		if (!d) throw new Error(`Content not found: ${id}`);
		return d;
	};
	for (const [c, rows] of Object.entries(seed)) for (const r of rows) add(c, r);

	return {
		get: async (c: string, id: string) => {
			const d = col(c).get(id);
			return d ? view(c, d) : null;
		},
		list: async (c: string, o: { limit?: number } = {}) => {
			const all = [...col(c).values()].map((d) => view(c, d));
			const limit = Math.min(o.limit ?? 50, 100);
			return { items: all.slice(0, limit), hasMore: all.length > limit };
		},
		create: async (c: string, data: Row) => {
			const { seo, ...fields } = data;
			check(c, data);
			return add(c, { data: fields, ...(seo ? { seo } : {}) });
		},
		update: async (c: string, id: string, data: Row) => {
			const d = must(c, id);
			check(c, data);
			const { seo, ...fields } = data;
			// seo skips the draft and is live at once (EmDash fact 14)
			if (seo) d.item.seo = { ...(d.item.seo as Row), ...(seo as Row) };
			if (Object.keys(fields).length > 0) {
				if (revisions) d.draft = { ...(d.draft ?? d.live), ...structuredClone(fields) };
				else Object.assign(d.live, structuredClone(fields));
				d.item.updatedAt = new Date().toISOString();
			}
			return view(c, d);
		},
		delete: async (c: string, id: string) => col(c).delete(id),
		publishDraft: (c: string, id: string) => {
			const d = must(c, id);
			if (d.draft) d.live = d.draft;
			d.draft = null;
			d.item.status = "published";
			d.item.publishedAt = new Date().toISOString();
			return view(c, d);
		},
		getDraft: (c: string, id: string) => {
			const d = must(c, id);
			return d.draft ? structuredClone(d.draft) : null;
		},
		seed: add,
	};
}

export interface MakeContextOptions extends Partial<PluginContext> {
	/** collection -> field slugs. update()/create() throw EmDashValidationError for others. */
	schema?: Record<string, string[]>;
	/** update() writes to a draft copy, get() reads live. Use ctx.publishDraft() to promote. */
	revisions?: boolean;
	/** Items to pre-load, by collection: `{ id?, slug?, status?, data }`. */
	items?: Record<string, Row[]>;
	/** Declared settings fields. `secret` fields only accept strings. */
	settingsSchema?: Record<string, { type?: string }>;
	/** Native-plugin descriptor options, exposed as ctx.options. */
	options?: Record<string, unknown>;
	/** Turns on ctx.http. Hosts outside the list (and an empty list) reject like EmDash. */
	allowedHosts?: string[];
	/** What ctx.http.fetch resolves with after the host check. Default: 200 `{}` JSON. */
	fetch?: (url: string, init?: RequestInit) => Response | Promise<Response>;
	/** Adds in-memory ctx.storage collections with these names. */
	storageCollections?: string[];
}

export type MockContext = PluginContext & {
	options: Record<string, unknown>;
	/** Every ctx.log call, in order. */
	logs: Array<{ level: "debug" | "info" | "warn" | "error"; message: string; data?: unknown }>;
	/** ctx.http.fetch calls that passed the host check. */
	fetchCalls: Array<{ url: string; init?: RequestInit }>;
	settings: ReturnType<typeof makeSettings>;
	redirects: ReturnType<typeof makeRedirects>;
	publishDraft: (collection: string, id: string) => Row;
	getDraft: (collection: string, id: string) => Row | null;
	seedContent: (collection: string, item: Row) => Row;
};

export function makeContext(opts: MakeContextOptions = {}): MockContext {
	const {
		schema,
		revisions = false,
		items = {},
		settingsSchema = {},
		options = {},
		allowedHosts,
		fetch: fetchImpl = () => Response.json({}),
		storageCollections,
		...overrides
	} = opts;

	const real = makeContent(schema, revisions, items);
	// Without schema/revisions keep the original loose vi.fn content mock.
	const content: ContentAccess =
		schema !== undefined || revisions
			? ({
					get: fn(real.get),
					list: fn(real.list),
					create: fn(real.create),
					update: fn(real.update),
					delete: fn(real.delete),
				} as unknown as ContentAccess)
			: {
					get: vi.fn().mockResolvedValue(null),
					list: vi.fn().mockResolvedValue({ items: [], cursor: null, hasMore: false }),
					create: vi.fn().mockResolvedValue({}),
					update: vi.fn().mockResolvedValue({}),
					delete: vi.fn().mockResolvedValue(true),
				};

	const pluginId = overrides.plugin?.id ?? "test-plugin";
	const settings = makeSettings(settingsSchema);
	const kv = Object.fromEntries(
		Object.entries(makeKV(settings)).map(([k, v]) => [k, fn(v as AnyFn)]),
	);
	const logs: MockContext["logs"] = [];
	const log = Object.fromEntries(
		(["info", "warn", "error", "debug"] as const).map((level) => [
			level,
			vi.fn((message: string, data?: unknown) => void logs.push({ level, message, data })),
		]),
	);
	const http = allowedHosts ? makeHttp(pluginId, allowedHosts, fetchImpl) : undefined;
	const storage = Object.fromEntries(
		(storageCollections ?? []).map((c) => [c, makeStorageCollection()]),
	);

	return {
		plugin: { id: pluginId, version: "0.0.0" },
		storage,
		kv,
		settings,
		redirects: makeRedirects(),
		log,
		logs,
		fetchCalls: http?.calls ?? [],
		site: { url: "https://example.com", name: "Test Site", locale: "en" },
		url: (path: string) => `https://example.com${path}`,
		content,
		media: undefined,
		http: http ? { fetch: http.fetch } : undefined,
		users: undefined,
		cron: undefined,
		email: undefined,
		options,
		publishDraft: real.publishDraft,
		getDraft: real.getDraft,
		seedContent: real.seed,
		...overrides,
	} as unknown as MockContext;
}

// ---------------------------------------------------------------------------
// Hooks and routes
// ---------------------------------------------------------------------------

const DEFAULT_HOOK_TIMEOUT = 5000;

type HookEntry = AnyFn | { handler: AnyFn; timeout?: number };
interface PluginLike {
	id?: string;
	hooks?: Record<string, HookEntry>;
	routes?: Record<
		string,
		AnyFn | { handler: AnyFn; methods?: string[]; input?: { safeParse(v: unknown): any } }
	>;
}

/**
 * Run one hook like HookPipeline: handler(event, ctx), rejecting with
 * `Hook timeout after <n>ms` once the hook's timeout (default 5000) passes.
 * As in EmDash, the timeout does not cancel the handler. Throws if the hook is missing.
 */
export async function runHook(
	plugin: PluginLike,
	hookName: string,
	event: unknown,
	ctx: PluginContext,
) {
	const entry = plugin.hooks?.[hookName];
	if (!entry) throw new Error(`Plugin has no hook "${hookName}"`);
	const { handler, timeout = DEFAULT_HOOK_TIMEOUT } =
		typeof entry === "function" ? { handler: entry } : entry;
	let timer: ReturnType<typeof setTimeout>;
	const timedOut = new Promise<never>((_, reject) => {
		timer = setTimeout(() => reject(new Error(`Hook timeout after ${timeout}ms`)), timeout);
	});
	try {
		return await Promise.race([Promise.resolve().then(() => handler(event, ctx)), timedOut]);
	} finally {
		clearTimeout(timer!);
	}
}

export type RouteResponse =
	| { success: true; data: unknown }
	| { success: false; error: { code: string; message: string; details?: unknown } };

export interface CallRouteOptions {
	method?: string;
	query?: Record<string, string>;
	body?: unknown;
	headers?: Record<string, string>;
	ctx?: PluginContext;
	user?: unknown;
}

/**
 * Invoke a route like EmDash's /_emdash/api/plugins/<id>/<route> endpoint and return the
 * wrapped body. The HTTP status is on a non-enumerable `status` property.
 * Standard (bare object) plugins get (routeCtx, ctx) with a plain-object request;
 * plugins with a string `id` (native) get one full ctx with a real Request.
 * Not modelled: auth on non-public routes.
 */
export async function callRoute(
	plugin: PluginLike,
	routeName: string,
	{ method = "GET", query, body, headers = {}, ctx = makeContext(), user }: CallRouteOptions = {},
): Promise<RouteResponse> {
	const out = (status: number, res: RouteResponse) =>
		Object.defineProperty(res, "status", { value: status, enumerable: false });
	const fail = (status: number, code: string, message: string, details?: unknown) =>
		out(status, {
			success: false,
			error: { code, message, ...(details === undefined ? {} : { details }) },
		});

	const entry = plugin.routes?.[routeName];
	if (!entry) return fail(404, "NOT_FOUND", "Plugin route not found");
	const route = typeof entry === "function" ? { handler: entry } : entry;
	const m = method.toUpperCase();
	if ("methods" in route && route.methods && !route.methods.includes(m)) {
		return fail(405, "METHOD_NOT_ALLOWED", "Method not allowed");
	}

	let input = body;
	if ("input" in route && route.input) {
		const parsed = route.input.safeParse(body);
		if (!parsed.success) return fail(400, "VALIDATION_ERROR", "Invalid request body", parsed.error);
		input = parsed.data;
	}

	const qs = query ? "?" + new URLSearchParams(query) : "";
	const url = `http://localhost:4321/_emdash/api/plugins/${plugin.id ?? ctx.plugin.id}/${routeName}${qs}`;
	const hasBody = body !== undefined && m !== "GET" && m !== "HEAD";
	const request = new Request(url, {
		method: m,
		headers: { ...(hasBody ? { "content-type": "application/json" } : {}), ...headers },
		body: hasBody ? JSON.stringify(body) : undefined,
	});
	const requestMeta = {
		ip: headers["x-forwarded-for"] ?? headers["cf-connecting-ip"] ?? null,
		userAgent: headers["user-agent"] ?? null,
	};

	try {
		const data =
			typeof plugin.id === "string"
				? await route.handler({ ...ctx, input, request, requestMeta, user })
				: await route.handler(
						{
							input,
							request: { url, method: m, headers: Object.fromEntries(request.headers) },
							requestMeta,
							user,
						},
						ctx,
					);
		return out(200, { success: true, data });
	} catch (error) {
		const e = error as { name?: string; code?: string; message?: string; status?: number; details?: unknown };
		if (e?.name === "PluginRouteError") return fail(e.status ?? 400, e.code!, e.message!, e.details);
		// EmDash hides unknown errors behind a generic message (500)
		return fail(500, "INTERNAL_ERROR", "Plugin route error");
	}
}

/**
 * A post shaped like getEmDashEntry(): `id` is the slug, `data.id` is the ULID, and the
 * Portable Text lives in `data[fieldName]` (official templates use "content").
 */
export function makePost({
	fieldName = "content",
	slug = "test-post",
	title = "Test Post",
	text = "Default test content for reading time calculation.",
	data = {},
}: { fieldName?: string; slug?: string; title?: string; text?: string; data?: Row } = {}) {
	return {
		id: slug,
		collection: "posts",
		data: {
			id: ulid(),
			slug,
			status: "published",
			title,
			[fieldName]: [
				{
					_type: "block",
					_key: "b1",
					style: "normal",
					markDefs: [],
					children: [{ _type: "span", _key: "s1", text, marks: [] }],
				},
			],
			...data,
		},
	};
}

export function makeContentItem(
	overrides?: Record<string, unknown>,
): Record<string, unknown> {
	const defaults: Record<string, unknown> = {
		id: "content-001",
		type: "posts",
		slug: "test-post",
		status: "published",
		data: {
			body: [
				{
					_type: "block",
					_key: "default-block",
					children: [
						{
							_type: "span",
							_key: "default-span",
							text: "Default test content for reading time calculation.",
							marks: [],
						},
					],
					markDefs: [],
					style: "normal",
				},
			],
			metadata: {},
		},
		createdAt: "2026-01-01T00:00:00Z",
		updatedAt: "2026-01-01T00:00:00Z",
		publishedAt: "2026-01-01T00:00:00Z",
	};

	return { ...defaults, ...overrides };
}
