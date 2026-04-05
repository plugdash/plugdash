// @plugdash/autobuild - sandbox entry (runs at request time)
// Standard plugin: no Node.js built-ins, no direct fetch().

import { definePlugin } from "emdash";
import type { PluginContext } from "emdash";
import type { AutobuildConfig, ContentStatus } from "./index.ts";

// ── Pure functions (exported for testing) ──

/**
 * Returns true when the hostname maps to localhost, loopback, RFC1918
 * private, or link-local address ranges. Blocks SSRF targets.
 */
export function isPrivateHostname(hostname: string): boolean {
	const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");

	if (h === "localhost" || h === "::1" || h === "0.0.0.0") return true;

	// 127.x.x.x loopback
	if (/^127\.\d+\.\d+\.\d+$/.test(h)) return true;

	// 10.x.x.x
	if (/^10\.\d+\.\d+\.\d+$/.test(h)) return true;

	// 192.168.x.x
	if (/^192\.168\.\d+\.\d+$/.test(h)) return true;

	// 169.254.x.x link-local
	if (/^169\.254\.\d+\.\d+$/.test(h)) return true;

	// 172.16.x.x - 172.31.x.x RFC1918
	const m = /^172\.(\d+)\.\d+\.\d+$/.exec(h);
	if (m) {
		const second = parseInt(m[1]!, 10);
		if (second >= 16 && second <= 31) return true;
	}

	return false;
}

export type ValidateResult =
	| { ok: true; url: URL }
	| { ok: false; reason: string };

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
	if (url.protocol !== "https:") {
		return { ok: false, reason: "non-https protocol" };
	}
	if (!url.hostname) {
		return { ok: false, reason: "missing hostname" };
	}
	if (isPrivateHostname(url.hostname)) {
		return { ok: false, reason: "private or loopback hostname" };
	}
	return { ok: true, url };
}

export interface ShouldTriggerEvent {
	content?: { status?: unknown } | undefined;
	collection: string;
}

export interface ShouldTriggerConfig {
	statuses: string[];
	collections?: string[];
}

/**
 * Decides whether an event should trigger a webhook. Tolerates
 * `event.content` being undefined (afterDelete case): a missing content
 * object passes the status check but the collection filter still applies.
 */
export function shouldTrigger(
	event: ShouldTriggerEvent,
	config: ShouldTriggerConfig,
): boolean {
	// Collection filter
	if (config.collections && !config.collections.includes(event.collection)) {
		return false;
	}
	// Status filter - skipped when no content object (afterDelete)
	if (event.content !== undefined) {
		const status = event.content.status;
		if (typeof status !== "string" || !config.statuses.includes(status)) {
			return false;
		}
	}
	return true;
}

// ── Debouncer ──

export class Debouncer {
	private timer: ReturnType<typeof setTimeout> | null = null;

	schedule(delayMs: number, fn: () => Promise<void> | void): void {
		if (this.timer !== null) {
			clearTimeout(this.timer);
		}
		this.timer = setTimeout(() => {
			this.timer = null;
			void Promise.resolve(fn()).catch(() => {
				// fn is responsible for its own error logging
			});
		}, delayMs);
	}
}

// Module-scoped singleton. Each plugin instance gets one debouncer.
const debouncer = new Debouncer();

// ── Config hash ──

function stableStringify(value: unknown): string {
	if (value === null || typeof value !== "object") return JSON.stringify(value);
	if (Array.isArray(value)) {
		return `[${value.map(stableStringify).join(",")}]`;
	}
	const rec = value as Record<string, unknown>;
	const keys = Object.keys(rec).sort();
	return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(rec[k])}`).join(",")}}`;
}

function hashConfig(config: AutobuildConfig): string {
	// Non-crypto hash, used only to detect config change across restarts.
	const s = stableStringify(config);
	let hash = 0;
	for (let i = 0; i < s.length; i++) {
		hash = (hash * 31 + s.charCodeAt(i)) | 0;
	}
	return `${s.length}:${hash}`;
}

// ── KV config read/write ──

interface ResolvedConfig {
	hookUrl: string;
	method: "POST" | "GET";
	collections: string[] | null;
	statuses: string[];
	debounceMs: number;
	timeout: number;
	body: Record<string, unknown> | null;
	headers: Record<string, string> | null;
}

async function getConfig(ctx: PluginContext): Promise<ResolvedConfig> {
	const hookUrl = (await ctx.kv.get<string>("autobuild:config:hookUrl")) ?? "";
	const method =
		(await ctx.kv.get<"POST" | "GET">("autobuild:config:method")) ?? "POST";
	const collections = await ctx.kv.get<string[] | null>(
		"autobuild:config:collections",
	);
	const statuses = (await ctx.kv.get<string[]>("autobuild:config:statuses")) ?? [
		"published",
	];
	const debounceMs =
		(await ctx.kv.get<number>("autobuild:config:debounceMs")) ?? 5000;
	const timeout = (await ctx.kv.get<number>("autobuild:config:timeout")) ?? 5000;
	const body = await ctx.kv.get<Record<string, unknown> | null>(
		"autobuild:config:body",
	);
	const headers = await ctx.kv.get<Record<string, string> | null>(
		"autobuild:config:headers",
	);
	return {
		hookUrl,
		method,
		collections: collections ?? null,
		statuses,
		debounceMs,
		timeout,
		body: body ?? null,
		headers: headers ?? null,
	};
}

async function seedFromBootstrap(
	ctx: PluginContext,
	bootstrap: AutobuildConfig,
): Promise<void> {
	await ctx.kv.set("autobuild:config:hookUrl", bootstrap.hookUrl ?? "");
	if (bootstrap.method !== undefined) {
		await ctx.kv.set("autobuild:config:method", bootstrap.method);
	}
	if (bootstrap.collections !== undefined) {
		await ctx.kv.set("autobuild:config:collections", bootstrap.collections);
	}
	if (bootstrap.statuses !== undefined) {
		await ctx.kv.set("autobuild:config:statuses", bootstrap.statuses);
	}
	if (bootstrap.debounceMs !== undefined) {
		await ctx.kv.set("autobuild:config:debounceMs", bootstrap.debounceMs);
	}
	if (bootstrap.timeout !== undefined) {
		await ctx.kv.set("autobuild:config:timeout", bootstrap.timeout);
	}
	if (bootstrap.body !== undefined) {
		await ctx.kv.set("autobuild:config:body", bootstrap.body);
	}
	if (bootstrap.headers !== undefined) {
		await ctx.kv.set("autobuild:config:headers", bootstrap.headers);
	}
	await ctx.kv.set("autobuild:bootstrapHash", hashConfig(bootstrap));
}

async function checkAndReseedBootstrap(ctx: PluginContext): Promise<void> {
	const bootstrap = globalThis.__plugdash_autobuild_config__;
	if (!bootstrap) return;
	const currentHash = hashConfig(bootstrap);
	const storedHash = await ctx.kv.get<string>("autobuild:bootstrapHash");
	if (storedHash === currentHash) return;
	await seedFromBootstrap(ctx, bootstrap);
}

// ── Webhook caller ──

async function fireWebhook(
	config: ResolvedConfig,
	ctx: PluginContext,
): Promise<void> {
	const check = validateHookUrl(config.hookUrl);
	if (!check.ok) {
		ctx.log.error("autobuild: invalid hook url", { reason: check.reason });
		return;
	}
	if (!ctx.http) {
		ctx.log.error("autobuild: http capability unavailable");
		return;
	}

	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), config.timeout);
	const startedAt = Date.now();

	try {
		const init: RequestInit = {
			method: config.method,
			headers: {
				"content-type": "application/json",
				...config.headers,
			},
			signal: controller.signal,
		};
		if (config.body !== null && config.method !== "GET") {
			init.body = JSON.stringify(config.body);
		}
		const res = await ctx.http.fetch(config.hookUrl, init);
		const latencyMs = Date.now() - startedAt;
		if (res.status >= 200 && res.status < 300) {
			ctx.log.info("autobuild: webhook fired", {
				status: res.status,
				latencyMs,
			});
		} else {
			ctx.log.error("autobuild: webhook non-2xx", {
				status: res.status,
				latencyMs,
			});
		}
	} catch (err) {
		ctx.log.error("autobuild: webhook failed", { err: String(err) });
	} finally {
		clearTimeout(timeoutId);
	}
}

// ── Admin page helpers ──

export function maskHookUrl(url: string): string {
	if (!url) return "";
	try {
		const parsed = new URL(url);
		const pathSnippet =
			parsed.pathname.length <= 8
				? parsed.pathname
				: parsed.pathname.slice(0, 8) + "...";
		return parsed.hostname + pathSnippet;
	} catch {
		return "(invalid)";
	}
}

function parseCollections(input: unknown): string[] | null {
	if (typeof input !== "string") return null;
	const list = input
		.split(",")
		.map((s) => s.trim())
		.filter((s) => s.length > 0);
	return list.length > 0 ? list : null;
}

export function validateAutobuildSettings(
	values: Record<string, unknown>,
	currentHookUrl: string,
): {
	ok: boolean;
	error?: string;
	hookUrl?: string;
	method?: "POST" | "GET";
	debounceMs?: number;
	collections?: string[] | null;
} {
	const methodRaw = String(values.method ?? "POST");
	if (methodRaw !== "POST" && methodRaw !== "GET") {
		return { ok: false, error: "Method must be POST or GET" };
	}
	const method = methodRaw as "POST" | "GET";

	const debounceRaw = values.debounceMs;
	const debounceMs = typeof debounceRaw === "number" ? debounceRaw : Number(debounceRaw);
	if (
		!Number.isFinite(debounceMs) ||
		!Number.isInteger(debounceMs) ||
		debounceMs < 500 ||
		debounceMs > 30000
	) {
		return {
			ok: false,
			error: "Debounce must be an integer between 500 and 30000 ms",
		};
	}

	const collections = parseCollections(values.collections);

	// Only update hookUrl if non-empty. Validate first.
	const newHookUrlRaw = typeof values.hookUrl === "string" ? values.hookUrl.trim() : "";
	let hookUrl = currentHookUrl;
	if (newHookUrlRaw.length > 0 && newHookUrlRaw !== currentHookUrl) {
		const check = validateHookUrl(newHookUrlRaw);
		if (!check.ok) {
			return {
				ok: false,
				error: `Hook URL rejected: ${check.reason}`,
			};
		}
		hookUrl = newHookUrlRaw;
	}

	return { ok: true, hookUrl, method, debounceMs, collections };
}

async function buildSettingsPage(ctx: PluginContext) {
	const hookUrl = (await ctx.kv.get<string>("autobuild:config:hookUrl")) ?? "";
	const method =
		(await ctx.kv.get<"POST" | "GET">("autobuild:config:method")) ?? "POST";
	const debounceMs =
		(await ctx.kv.get<number>("autobuild:config:debounceMs")) ?? 5000;
	const collections = await ctx.kv.get<string[] | null>(
		"autobuild:config:collections",
	);

	const masked = maskHookUrl(hookUrl);

	return {
		blocks: [
			{ type: "header", text: "Autobuild Settings" },
			{
				type: "context",
				text: "Fire a deploy webhook when content is published.",
			},
			{ type: "divider" },
			...(hookUrl
				? [
						{
							type: "fields",
							fields: [{ label: "Current hook URL", value: masked }],
						},
				  ]
				: []),
			{
				type: "form",
				block_id: "autobuild-settings",
				fields: [
					{
						type: "text_input",
						action_id: "hookUrl",
						label: "Deploy hook URL",
						placeholder:
							"https://api.cloudflare.com/client/v4/pages/webhooks/deploy_hooks/...",
						initial_value: "",
						help_text:
							"The webhook URL from your hosting provider. Kept private - leave blank to keep the existing value.",
					},
					{
						type: "select",
						action_id: "method",
						label: "HTTP method",
						options: [
							{ label: "POST (default)", value: "POST" },
							{ label: "GET", value: "GET" },
						],
						initial_value: method,
					},
					{
						type: "number_input",
						action_id: "debounceMs",
						label: "Debounce window (milliseconds)",
						placeholder: "5000",
						min: 500,
						max: 30000,
						initial_value: debounceMs,
						help_text:
							"Rapid publishes within this window are coalesced into one deploy.",
					},
					{
						type: "text_input",
						action_id: "collections",
						label: "Collections (comma-separated, leave blank for all)",
						placeholder: "blog, docs",
						initial_value:
							collections && collections.length > 0
								? collections.join(", ")
								: "",
					},
				],
				submit: { label: "Save", action_id: "save_settings" },
			},
		],
	};
}

async function handleSaveSettings(
	values: Record<string, unknown>,
	ctx: PluginContext,
) {
	const currentHookUrl =
		(await ctx.kv.get<string>("autobuild:config:hookUrl")) ?? "";
	const result = validateAutobuildSettings(values, currentHookUrl);
	if (!result.ok) {
		const page = await buildSettingsPage(ctx);
		return { ...page, toast: { message: result.error, type: "error" } };
	}
	await ctx.kv.set("autobuild:config:hookUrl", result.hookUrl ?? "");
	await ctx.kv.set("autobuild:config:method", result.method!);
	await ctx.kv.set("autobuild:config:debounceMs", result.debounceMs!);
	await ctx.kv.set("autobuild:config:collections", result.collections ?? null);
	const page = await buildSettingsPage(ctx);
	return { ...page, toast: { message: "Settings saved", type: "success" } };
}

// ── Plugin definition ──

export default definePlugin({
	hooks: {
		"plugin:install": {
			handler: async (_event: unknown, ctx: PluginContext) => {
				try {
					const bootstrap = globalThis.__plugdash_autobuild_config__;
					if (bootstrap) {
						await seedFromBootstrap(ctx, bootstrap);
						let hostname = "(missing)";
						if (typeof bootstrap.hookUrl === "string") {
							try {
								hostname = new URL(bootstrap.hookUrl).hostname;
							} catch {
								hostname = "(invalid)";
							}
						}
						ctx.log.info("autobuild: installed", { hostname });
					} else {
						ctx.log.info("autobuild: installed with empty config");
					}
					const hookUrl = await ctx.kv.get<string>("autobuild:config:hookUrl");
					if (!hookUrl) {
						ctx.log.warn(
							"autobuild: hookUrl not configured - plugin will no-op until configured",
						);
					}
				} catch (err) {
					ctx.log.error("autobuild: install failed", { err: String(err) });
				}
			},
		},

		"content:afterSave": {
			handler: async (
				event: { content: Record<string, unknown>; collection: string },
				ctx: PluginContext,
			) => {
				try {
					await checkAndReseedBootstrap(ctx);
					const config = await getConfig(ctx);
					if (!config.hookUrl) return;
					if (
						!shouldTrigger(
							{
								content: event.content as { status?: unknown },
								collection: event.collection,
							},
							{
								statuses: config.statuses,
								collections: config.collections ?? undefined,
							},
						)
					) {
						return;
					}
					debouncer.schedule(config.debounceMs, () =>
						fireWebhook(config, ctx),
					);
				} catch (err) {
					ctx.log.error("autobuild: afterSave failed", { err: String(err) });
				}
			},
		},

		"content:afterDelete": {
			handler: async (
				event: { id: string; collection: string },
				ctx: PluginContext,
			) => {
				try {
					await checkAndReseedBootstrap(ctx);
					const config = await getConfig(ctx);
					if (!config.hookUrl) return;
					if (
						!shouldTrigger(
							{ collection: event.collection },
							{
								statuses: config.statuses,
								collections: config.collections ?? undefined,
							},
						)
					) {
						return;
					}
					debouncer.schedule(config.debounceMs, () =>
						fireWebhook(config, ctx),
					);
				} catch (err) {
					ctx.log.error("autobuild: afterDelete failed", {
						err: String(err),
					});
				}
			},
		},
	},

	routes: {
		admin: {
			handler: async (
				routeCtx: { input: unknown; request: { url: string } },
				ctx: PluginContext,
			) => {
				const interaction = routeCtx.input as {
					type?: string;
					action_id?: string;
					values?: Record<string, unknown>;
				};
				if (
					!interaction ||
					interaction.type === "page_load" ||
					interaction.type === undefined
				) {
					return buildSettingsPage(ctx);
				}
				if (
					interaction.type === "form_submit" &&
					interaction.action_id === "save_settings"
				) {
					return handleSaveSettings(interaction.values ?? {}, ctx);
				}
				return buildSettingsPage(ctx);
			},
		},
	},
});

export type { AutobuildConfig, ContentStatus };
