// @plugdash/autobuild - Native plugin. Fires a deploy hook on publish and
// unpublish (and on delete of a published entry). Options come straight from
// createPlugin(options), which works in dev and in production builds.

import { definePlugin } from "emdash";
import type { PluginContext, PluginDescriptor } from "emdash";
import pkg from "../package.json" with { type: "json" };

const ID = "autobuild";
const VERSION = pkg.version;

export interface AutobuildOptions {
	/** Deploy webhook URL. The admin secret setting `hookUrl` wins over this. */
	hookUrl?: string;
	/** HTTP method. Default: "POST". */
	method?: "POST" | "GET";
	/** Restrict to specific collections. Default: all. */
	collections?: string[];
	/** Coalesce rapid triggers into one deploy. Default: 5000ms. */
	debounceMs?: number;
	/** Request timeout in ms. Default: 5000. */
	timeout?: number;
	/** Optional JSON body. */
	body?: Record<string, unknown>;
	/** Optional additional headers. */
	headers?: Record<string, string>;
	/** Extra allowed hosts, added to the Cloudflare/Netlify/Vercel defaults. */
	allowedHosts?: string[];
}

export interface ResolvedOptions {
	hookUrl: string;
	method: "POST" | "GET";
	collections: string[];
	debounceMs: number;
	timeout: number;
	body: Record<string, unknown> | null;
	headers: Record<string, string>;
	allowedHosts: string[];
}

export const DEFAULT_HOSTS = ["api.cloudflare.com", "api.netlify.com", "api.vercel.com"];

// ── pure helpers ──

export function isPrivateHostname(hostname: string): boolean {
	const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
	if (h === "localhost" || h === "::1" || h === "0.0.0.0") return true;
	if (/^(127|10)\.\d+\.\d+\.\d+$/.test(h)) return true;
	if (/^192\.168\.\d+\.\d+$/.test(h)) return true;
	if (/^169\.254\.\d+\.\d+$/.test(h)) return true;
	const m = /^172\.(\d+)\.\d+\.\d+$/.exec(h);
	if (m) {
		const second = parseInt(m[1]!, 10);
		if (second >= 16 && second <= 31) return true;
	}
	return false;
}

export type ValidateResult = { ok: true; url: URL } | { ok: false; reason: string };

export function validateHookUrl(input: unknown): ValidateResult {
	if (typeof input !== "string" || input.length === 0) {
		return { ok: false, reason: "empty or non-string" };
	}
	let url: URL;
	try {
		url = new URL(input);
	} catch {
		return { ok: false, reason: "malformed url" };
	}
	if (url.protocol !== "https:") return { ok: false, reason: "non-https protocol" };
	if (!url.hostname) return { ok: false, reason: "missing hostname" };
	if (isPrivateHostname(url.hostname)) {
		return { ok: false, reason: "private or loopback hostname" };
	}
	return { ok: true, url };
}

/** Hostname of a URL, or null when missing or malformed. */
export function parseHookHostname(hookUrl: string | undefined): string | null {
	if (typeof hookUrl !== "string" || hookUrl.length === 0) return null;
	try {
		return new URL(hookUrl).hostname || null;
	} catch {
		return null;
	}
}

/** True when hostname matches an allowedHosts entry ("*.x.com" wildcards supported). */
export function hostAllowed(hostname: string, allowed: string[]): boolean {
	return allowed.some((a) => (a.startsWith("*.") ? hostname.endsWith(a.slice(1)) : hostname === a));
}

export function getOptions(raw: AutobuildOptions = {}): ResolvedOptions {
	const num = (v: unknown, d: number) => (typeof v === "number" && v >= 0 ? v : d);
	const host = parseHookHostname(raw.hookUrl);
	const extra = Array.isArray(raw.allowedHosts) ? raw.allowedHosts : [];
	return {
		hookUrl: typeof raw.hookUrl === "string" ? raw.hookUrl : "",
		method: raw.method === "GET" ? "GET" : "POST",
		collections: Array.isArray(raw.collections) ? raw.collections : [],
		debounceMs: num(raw.debounceMs, 5000),
		timeout: num(raw.timeout, 5000),
		body: raw.body ?? null,
		headers: raw.headers ?? {},
		allowedHosts: [...new Set([...DEFAULT_HOSTS, ...extra, ...(host ? [host] : [])])],
	};
}

// ── warn once per process (rule H) ──

const warned = new Set<string>();

function warnOnce(ctx: PluginContext, key: string, message: string): void {
	if (warned.has(key)) return;
	warned.add(key);
	ctx.log.warn(message);
}

/** Test helper. */
export function resetWarnings(): void {
	warned.clear();
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── descriptor factory (astro.config.mjs) ──

export function autobuildPlugin(
	options: AutobuildOptions = {},
): PluginDescriptor<AutobuildOptions> {
	return {
		id: ID,
		version: VERSION,
		format: "native",
		entrypoint: "@plugdash/autobuild",
		options,
		capabilities: ["content:read", "network:request"],
		allowedHosts: getOptions(options).allowedHosts,
	};
}

// ── runtime plugin ──

export function createPlugin(rawOptions: AutobuildOptions = {}) {
	const options = getOptions(rawOptions);
	const wants = (collection: string) =>
		options.collections.length === 0 || options.collections.includes(collection);

	/** Admin secret first, then the option. */
	async function resolveHookUrl(ctx: PluginContext): Promise<string> {
		const fromAdmin = await ctx.settings.get<string>("hookUrl");
		if (typeof fromAdmin === "string" && fromAdmin.trim()) return fromAdmin.trim();
		return options.hookUrl;
	}

	async function fire(ctx: PluginContext, hookUrl: string): Promise<void> {
		const check = validateHookUrl(hookUrl);
		if (!check.ok) {
			ctx.log.error("invalid hook url", { reason: check.reason });
			return;
		}
		if (!hostAllowed(check.url.hostname, options.allowedHosts)) {
			ctx.log.error("hook host not allowed, add it to the allowedHosts option", {
				host: check.url.hostname,
			});
			return;
		}
		if (!ctx.http) {
			ctx.log.error("network capability unavailable");
			return;
		}
		const startedAt = Date.now();
		try {
			const init: RequestInit = {
				method: options.method,
				headers: { "content-type": "application/json", ...options.headers },
				signal: AbortSignal.timeout(options.timeout),
			};
			if (options.body !== null && options.method !== "GET") {
				init.body = JSON.stringify(options.body);
			}
			const res = await ctx.http.fetch(check.url.toString(), init);
			const latencyMs = Date.now() - startedAt;
			if (res.status >= 200 && res.status < 300) {
				ctx.log.info("webhook fired", { status: res.status, latencyMs });
			} else {
				ctx.log.error("webhook non-2xx", { status: res.status, latencyMs });
			}
		} catch (err) {
			ctx.log.error("webhook failed", { err: String(err) });
		}
	}

	/**
	 * Debounce that survives Workers and multiple isolates: every trigger
	 * writes a unique token to KV, sleeps, and fires only if its token is
	 * still the latest. The last trigger in a burst wins.
	 */
	async function schedule(ctx: PluginContext, collection: string): Promise<void> {
		if (!wants(collection)) return;
		const hookUrl = await resolveHookUrl(ctx);
		if (!hookUrl) {
			warnOnce(ctx, "no-hook", "no hook URL configured, deploys are off");
			return;
		}
		const token = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
		await ctx.kv.set("gen", token);
		await sleep(options.debounceMs);
		if ((await ctx.kv.get<string>("gen")) !== token) return;
		await fire(ctx, hookUrl);
	}

	const timeout = options.debounceMs + options.timeout + 5000;

	return definePlugin({
		id: ID,
		version: VERSION,
		capabilities: ["content:read", "network:request"],
		allowedHosts: options.allowedHosts,
		admin: {
			pages: [{ path: "/", label: "Autobuild", icon: "cloud-arrow-up" }],
			settingsSchema: {
				hookUrl: {
					type: "secret",
					label: "Deploy hook URL",
					description:
						"Overrides the hookUrl option. Needs EMDASH_ENCRYPTION_KEY. The host must be allowed.",
				},
			},
		},
		hooks: {
			"content:afterPublish": {
				timeout,
				handler: async (event, ctx) => {
					try {
						await schedule(ctx, event.collection);
					} catch (err) {
						ctx.log.error("afterPublish failed", { err: String(err) });
					}
				},
			},

			// event.content is the full entry here (status "draft")
			"content:afterUnpublish": {
				timeout,
				handler: async (event, ctx) => {
					try {
						await schedule(ctx, event.collection);
					} catch (err) {
						ctx.log.error("afterUnpublish failed", { err: String(err) });
					}
				},
			},

			// afterDelete only carries { id, collection, permanent }, so remember
			// here whether the entry was live.
			"content:beforeDelete": async (event, ctx) => {
				try {
					if (!wants(event.collection)) return;
					const item = await ctx.content?.get(event.collection, event.id);
					if (item?.status === "published") await ctx.kv.set(`live:${event.id}`, true);
				} catch (err) {
					ctx.log.error("beforeDelete failed", { err: String(err) });
				}
			},

			"content:afterDelete": {
				timeout,
				handler: async (event, ctx) => {
					try {
						const key = `live:${event.id}`;
						if (!(await ctx.kv.get(key))) return;
						await ctx.kv.delete(key);
						await schedule(ctx, event.collection);
					} catch (err) {
						ctx.log.error("afterDelete failed", { err: String(err) });
					}
				},
			},
		},
		routes: {
			admin: {
				handler: async (ctx) => {
					const hookUrl = await resolveHookUrl(ctx);
					const host = parseHookHostname(hookUrl);
					const check = validateHookUrl(hookUrl);
					let status = "No hook URL set. Deploys are off.";
					if (hookUrl) {
						if (!check.ok) status = `Hook URL rejected: ${check.reason}.`;
						else if (!hostAllowed(host!, options.allowedHosts)) {
							status = `Host ${host} is not allowed. Add it to the allowedHosts option.`;
						} else status = `Ready. Deploys go to ${host}.`;
					}
					return {
						blocks: [
							{ type: "header", text: "Autobuild" },
							{ type: "section", text: status },
							{
								type: "context",
								text: `Allowed hosts: ${options.allowedHosts.join(", ")}. Set the hook URL under the plugin settings.`,
							},
						],
					};
				},
			},
		},
	});
}

export default createPlugin;
