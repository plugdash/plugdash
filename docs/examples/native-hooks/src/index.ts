// Minimal native-format EmDash plugin. It exists to prove the pattern in
// docs/plugin-pattern.md on a real EmDash 1.0.1 site. Not published.
//
// One module holds both halves:
// - examplePlugin(options) runs in astro.config.mjs (build process) and
//   returns the descriptor. EmDash inlines `options` as JSON into the server
//   bundle.
// - createPlugin(options) runs in the server (dev, node, Workers). EmDash
//   calls it with that JSON. This is the only place options are read.

import { definePlugin } from "emdash";
import type { PluginContext, PluginDescriptor } from "emdash";

const ID = "native-example";
const VERSION = "0.0.0";

// ── options ──

export interface ExampleOptions {
	/** Collections the hooks act on. Empty = all. */
	collections?: string[];
	/** Shown by the public ping route, proves options reach the server. */
	greeting?: string;
	/** Test probe: sleep this long in afterPublish (item g). */
	sleepMs?: number;
}

type ResolvedOptions = Required<ExampleOptions>;

export function getOptions(options: ExampleOptions = {}): ResolvedOptions {
	return {
		collections: Array.isArray(options.collections) ? options.collections : [],
		greeting: typeof options.greeting === "string" ? options.greeting : "hello",
		sleepMs: typeof options.sleepMs === "number" ? options.sleepMs : 0,
	};
}

// ── one-time warning (rule H) ──

// Module scope = once per server process / Workers isolate.
const warned = new Set<string>();

export function warnOnce(ctx: PluginContext, key: string, message: string): void {
	if (warned.has(key)) return;
	warned.add(key);
	ctx.log.warn(message);
}

// ── descriptor factory (astro.config.mjs) ──

export function examplePlugin(options: ExampleOptions = {}): PluginDescriptor<ExampleOptions> {
	return {
		id: ID,
		version: VERSION,
		format: "native",
		entrypoint: "@plugdash/example-native-hooks",
		options,
	};
}

// ── runtime plugin (server) ──

function isRecord(v: unknown): v is Record<string, unknown> {
	return typeof v === "object" && v !== null && !Array.isArray(v);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function createPlugin(rawOptions: ExampleOptions = {}) {
	const options = getOptions(rawOptions);
	const wants = (collection: string) =>
		options.collections.length === 0 || options.collections.includes(collection);

	return definePlugin({
		id: ID,
		version: VERSION,
		// Hooks are gated by capability at registration (plugins/hooks.ts
		// HOOK_REQUIRED_CAPABILITY). A missing one only logs a console warning
		// and the hook never runs. beforeSave needs content:write.
		capabilities: ["content:read", "content:write", "schema:read", "redirects:write"],
		storage: {
			events: { indexes: ["collection", "createdAt", ["collection", "createdAt"]] },
		},
		admin: {
			pages: [{ path: "/", label: "Native example", icon: "gear" }],
			settingsSchema: {
				apiKey: { type: "secret", label: "API key" },
				mode: { type: "string", label: "Mode", default: "fast" },
			},
		},
		hooks: {
			// (c) mutate the node in the same write. event.content is the data
			// object being saved (title, content, ...), not the full entry.
			"content:beforeSave": {
				handler: async (event, ctx) => {
					try {
						if (!wants(event.collection)) return;
						const blocks = event.content.content;
						if (!Array.isArray(blocks)) return;
						let changed = false;
						const next = blocks.map((node: unknown) => {
							if (!isRecord(node) || node._type !== "code") return node;
							changed = true;
							return { ...node, lineCount: String(node.code ?? "").split("\n").length };
						});
						if (!changed) return;
						return { ...event.content, content: next };
					} catch (err) {
						ctx.log.error("beforeSave failed", { err: String(err) });
					}
				},
			},

			// (b) fires on create, update and autosave. Log the shape only.
			"content:afterSave": async (event, ctx) => {
				ctx.log.info("afterSave", {
					collection: event.collection,
					isNew: event.isNew,
					status: event.content.status,
					keys: Object.keys(event.content),
					dataKeys: isRecord(event.content.data) ? Object.keys(event.content.data) : null,
				});
			},

			// (a) (g) (h) (i) publish is where paid or heavy work goes (rule A).
			"content:afterPublish": {
				timeout: 60_000,
				handler: async (event, ctx) => {
					try {
						if (!wants(event.collection)) return;
						const id = String(event.content.id);
						const apiKey = await ctx.settings.get<string>("apiKey");
						// ctx.log already prefixes "[plugin:<id>]", so no id in the message.
						if (!apiKey) warnOnce(ctx, "apiKey", "no API key set, skipping paid work");
						ctx.log.info("afterPublish", {
							collection: event.collection,
							id,
							status: event.content.status,
							greeting: options.greeting,
							hasApiKey: Boolean(apiKey),
						});

						const collection = await ctx.schema?.getCollection(event.collection);
						const otherList = await ctx.content?.list("pages", { limit: 1 });
						ctx.log.info("afterPublish lookups", {
							urlPattern: collection?.urlPattern ?? null,
							publicUrl: (await ctx.content?.getPublicUrl?.(event.collection, id)) ?? null,
							pagesVisible: otherList ? otherList.items.length : null,
						});

						await ctx.storage.events!.put(`${id}:${Date.now()}`, {
							collection: event.collection,
							entryId: id,
							createdAt: new Date().toISOString(),
						});

						const slug = String(event.content.slug ?? id);
						const source = `/go/${slug}`;
						const existing = await ctx.redirects?.list({ search: source, limit: 1 });
						if (!existing?.items.some((r) => r.source === source)) {
							await ctx.redirects?.create?.({
								source,
								destination: `/posts/${slug}`,
								type: 302,
								groupName: ID,
							});
						}

						await ctx.cron?.schedule("once", {
							schedule: new Date(Date.now() + 15_000).toISOString(),
							data: { id },
						});

						if (options.sleepMs > 0) {
							await sleep(options.sleepMs);
							ctx.log.info("afterPublish slept", { ms: options.sleepMs });
						}
					} catch (err) {
						ctx.log.error("afterPublish failed", { err: String(err) });
					}
				},
			},

			"content:afterUnpublish": async (event, ctx) => {
				ctx.log.info("afterUnpublish", {
					collection: event.collection,
					id: event.content.id,
					status: event.content.status,
					publishedAt: event.content.publishedAt ?? null,
				});
			},

			"content:beforeDelete": async (event, ctx) => {
				const item = await ctx.content?.get(event.collection, event.id);
				ctx.log.info("beforeDelete", { ...event, status: item?.status ?? null });
			},

			"content:afterDelete": async (event, ctx) => {
				const item = await ctx.content?.get(event.collection, event.id);
				ctx.log.info("afterDelete", { ...event, getStatus: item?.status ?? null });
			},

			cron: async (event, ctx) => {
				ctx.log.info("cron", { name: event.name, data: event.data ?? null });
			},
		},
		routes: {
			// (d) GET or POST /_emdash/api/plugins/native-example/ping
			ping: {
				public: true,
				handler: async () => ({ greeting: options.greeting, collections: options.collections }),
			},

			// (i) query storage by index. Private: needs an admin session.
			events: {
				handler: async (ctx) => {
					const url = new URL(ctx.request.url);
					const collection = url.searchParams.get("collection") ?? "posts";
					const res = await ctx.storage.events!.query({
						where: { collection },
						orderBy: { createdAt: "desc" },
						limit: 10,
					});
					const count = await ctx.storage.events!.count({ collection });
					if (url.searchParams.get("purge") === "1") {
						await ctx.storage.events!.deleteMany(res.items.map((i) => i.id));
					}
					return { count, items: res.items };
				},
			},

			// (f) read the secret back. Never return the value itself.
			secret: {
				handler: async (ctx) => {
					const apiKey = await ctx.settings.get<string>("apiKey");
					const mode = (await ctx.settings.get<string>("mode")) ?? "fast";
					return { set: Boolean(apiKey), length: apiKey?.length ?? 0, mode };
				},
			},

			// (e) Block Kit admin page. Must accept POST JSON.
			admin: {
				handler: async (ctx) => {
					const interaction = isRecord(ctx.input) ? ctx.input : {};
					const count = await ctx.storage.events!.count();
					const blocks = [
						{ type: "header", text: "Native example" },
						{ type: "context", text: `Greeting from options: ${options.greeting}` },
						{ type: "section", text: `Stored publish events: ${count}` },
					];
					if (interaction.type === "block_action") {
						return { blocks, toast: { message: "Clicked", type: "success" } };
					}
					return {
						blocks: [
							...blocks,
							{
								type: "actions",
								elements: [{ type: "button", action_id: "ping", label: "Ping" }],
							},
						],
					};
				},
			},
		},
	});
}

export default createPlugin;
