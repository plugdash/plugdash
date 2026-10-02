import { definePlugin } from "emdash";
import type { PluginContext, PluginDescriptor } from "emdash";
import { isRecord } from "@plugdash/types";
import pkg from "../package.json" with { type: "json" };
import {
	DEFAULT_MODEL,
	MIN_WORDS,
	PROVIDER_HOSTS,
	buildPrompt,
	buildRequest,
	classifyStatus,
	contentHash,
	countWords,
	extractText,
	isBlockedHostError,
	parseResponse,
	pickBody,
	resolveEnrichments,
	type Enrichment,
	type EnrichkitProvider,
	type EnrichmentFlags,
} from "./enrich-logic.ts";

const ID = "enrichkit";

export interface EnrichkitOptions {
	/** Which LLM API to call. Default "anthropic". */
	provider?: EnrichkitProvider;
	/** Model id. Defaults to claude-haiku-4-5 (anthropic) or gpt-4o-mini (openai). */
	model?: string;
	/** Which enrichments to generate. Omitted flags fall back to their defaults. */
	enrichments?: Partial<EnrichmentFlags>;
	/** Portable Text field to read. Default: content, then body, then the first PT array. */
	field?: string;
	/** Fill seo.description with the summary when it is empty. Default true. */
	writeSeoDescription?: boolean;
	/** Abort the provider request after this many ms. Default 30000. */
	timeoutMs?: number;
	/**
	 * API key in astro.config. Prefer the encrypted `apiKey` setting in the
	 * admin: an option ends up in the build output as plain text.
	 */
	apiKey?: string;
}

export interface ResolvedOptions {
	provider: EnrichkitProvider;
	model: string;
	enrichments: EnrichmentFlags;
	field: string | undefined;
	writeSeoDescription: boolean;
	timeoutMs: number;
	apiKey: string | undefined;
}

export function getOptions(options: EnrichkitOptions = {}): ResolvedOptions {
	const provider = options.provider === "openai" ? "openai" : "anthropic";
	return {
		provider,
		model: options.model?.trim() || DEFAULT_MODEL[provider],
		enrichments: resolveEnrichments(options.enrichments),
		field: options.field || undefined,
		writeSeoDescription: options.writeSeoDescription !== false,
		timeoutMs:
			typeof options.timeoutMs === "number" && options.timeoutMs > 0 ? options.timeoutMs : 30000,
		apiKey: options.apiKey?.trim() || undefined,
	};
}

/** What is stored in KV `result:<id>`, one row per entry. */
export interface EnrichkitResult extends Enrichment {
	collection: string;
	title: string;
	model: string;
	generatedAt: string;
	hash: string;
}

// ── descriptor, used in astro.config.mjs ──

export function enrichkitPlugin(
	options: EnrichkitOptions = {},
): PluginDescriptor<EnrichkitOptions> {
	return {
		id: ID,
		version: pkg.version,
		format: "native",
		entrypoint: "@plugdash/enrichkit",
		options,
	};
}

export default enrichkitPlugin;

// ── runtime ──

const warned = new Set<string>();

function warnOnce(ctx: PluginContext, key: string, message: string): void {
	if (warned.has(key)) return;
	warned.add(key);
	ctx.log.warn(message);
}

type Outcome =
	| { status: "enriched"; result: EnrichkitResult }
	| { status: "unchanged" | "skipped" | "failed" };

interface Entry {
	collection: string;
	id: string;
	data: Record<string, unknown>;
}

async function getApiKey(ctx: PluginContext, options: ResolvedOptions): Promise<string | null> {
	const stored = await ctx.settings.get<string>("apiKey");
	if (typeof stored === "string" && stored.trim()) return stored.trim();
	if (options.apiKey) {
		warnOnce(
			ctx,
			"optionKey",
			"API key comes from astro.config options; set it as the apiKey secret in the admin instead",
		);
		return options.apiKey;
	}
	return null;
}

/** One provider call. Returns null on any failure, after logging why. */
async function callProvider(
	ctx: PluginContext,
	options: ResolvedOptions,
	apiKey: string,
	prompt: string,
): Promise<ReturnType<typeof parseResponse> | null> {
	if (!ctx.http) {
		ctx.log.error("network:request capability unavailable");
		return null;
	}
	const spec = buildRequest(options.provider, apiKey, options.model, prompt, options.enrichments);
	const host = new URL(spec.url).hostname;
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), options.timeoutMs);
	ctx.log.info("calling provider", { provider: options.provider, model: options.model });
	try {
		const res = await ctx.http.fetch(spec.url, { ...spec.init, signal: controller.signal });
		if (res.status < 200 || res.status >= 300) {
			const failure = classifyStatus(res.status);
			const messages = {
				rate_limit:
					"rate limited by provider, skipping (no retry; the next changed publish tries again)",
				quota: "provider rejected the request for quota or billing reasons",
				auth: "provider rejected the API key",
				server: "provider returned a server error",
				client: "provider rejected the request",
			};
			ctx.log.error(messages[failure], { provider: options.provider, status: res.status });
			return null;
		}
		return parseResponse(options.provider, await res.json(), options.enrichments);
	} catch (err) {
		if (isBlockedHostError(err)) {
			ctx.log.error(
				`host ${host} not in allowedHosts; set provider in astro.config.mjs or add it to allowedHosts`,
			);
		} else if (controller.signal.aborted) {
			ctx.log.error("provider request timed out", { timeoutMs: options.timeoutMs });
		} else {
			ctx.log.error("provider request failed", { err: String(err) });
		}
		return null;
	} finally {
		clearTimeout(timer);
	}
}

/**
 * Enriches one entry. `force` skips the change check (admin Regenerate).
 * Never throws: every failure is logged and reported as an outcome.
 */
export async function enrich(
	ctx: PluginContext,
	options: ResolvedOptions,
	entry: Entry,
	force = false,
): Promise<Outcome> {
	try {
		const bodyText = extractText(pickBody(entry.data, options.field));
		const wordCount = countWords(bodyText);
		if (wordCount < MIN_WORDS) {
			ctx.log.info("content too short to enrich, skipping", { id: entry.id, wordCount });
			return { status: "skipped" };
		}

		const title = typeof entry.data.title === "string" ? entry.data.title : "";
		const hash = await contentHash(options.model, options.enrichments, title, bodyText);
		const resultKey = `result:${entry.id}`;
		const previous = await ctx.kv.get<EnrichkitResult>(resultKey);
		if (!force && previous?.hash === hash) {
			ctx.log.info("content unchanged since last enrichment, skipping", { id: entry.id });
			return { status: "unchanged" };
		}

		const apiKey = await getApiKey(ctx, options);
		if (!apiKey) {
			warnOnce(
				ctx,
				"noKey",
				"no API key: set the apiKey secret under Plugins > enrichkit > Settings (needs EMDASH_ENCRYPTION_KEY)",
			);
			return { status: "skipped" };
		}

		const parsed = await callProvider(ctx, options, apiKey, buildPrompt(title, bodyText));
		if (!parsed) return { status: "failed" };
		if (!parsed.ok) {
			ctx.log.error("could not read the provider response, not retrying", {
				reason: parsed.error,
			});
			return { status: "failed" };
		}

		const result: EnrichkitResult = {
			...parsed.value,
			collection: entry.collection,
			title,
			model: options.model,
			generatedAt: new Date().toISOString(),
			hash,
		};
		await ctx.kv.set(resultKey, result);

		if (options.writeSeoDescription && result.summary) {
			await fillSeoDescription(ctx, entry, result.summary);
		}

		ctx.log.info("enriched", {
			id: entry.id,
			fields: Object.keys(parsed.value),
			tokens: parsed.tokens,
		});
		return { status: "enriched", result };
	} catch (err) {
		ctx.log.error("enrichment failed", { id: entry.id, err: String(err) });
		return { status: "failed" };
	}
}

/**
 * A seo-only update skips the draft revision and is live at once. Only fills
 * an empty description, never overwrites one the author wrote.
 */
async function fillSeoDescription(
	ctx: PluginContext,
	entry: Entry,
	summary: string,
): Promise<void> {
	try {
		const live = await ctx.content?.get(entry.collection, entry.id);
		if (!live?.seo || live.seo.description) return;
		await ctx.content?.update?.(entry.collection, entry.id, { seo: { description: summary } });
	} catch (err) {
		ctx.log.warn("could not write seo.description", { id: entry.id, err: String(err) });
	}
}

// ── admin page ──

function resultBlocks(id: string, result: EnrichkitResult | null): unknown[] {
	if (!result) return [{ type: "section", text: `No stored result for ${id}.` }];
	const fields = [
		{ label: "Summary", value: result.summary },
		{ label: "Topics", value: result.topics?.join(", ") },
		{ label: "Tags", value: result.tags?.join(", ") },
		{ label: "Reading level", value: result.readingLevel },
		{ label: "Tweet", value: result.tweet },
		{ label: "Model", value: result.model },
		{ label: "Generated", value: result.generatedAt },
	].filter((f): f is { label: string; value: string } => Boolean(f.value));
	return [
		{ type: "header", text: result.title || id },
		{ type: "fields", fields },
		{
			type: "actions",
			elements: [
				{
					type: "button",
					action_id: "regenerate",
					label: "Regenerate",
					style: "primary",
					value: { id, collection: result.collection },
					confirm: {
						title: "Regenerate?",
						text: "This makes one paid provider call.",
						confirm: "Regenerate",
						deny: "Cancel",
					},
				},
			],
		},
	];
}

async function adminPage(ctx: PluginContext, selected?: string) {
	const rows = await ctx.kv.list("result:");
	const entries = rows
		.map((row) => ({ id: row.key.slice("result:".length), result: row.value as EnrichkitResult }))
		.sort((a, b) => String(b.result.generatedAt).localeCompare(String(a.result.generatedAt)));
	const blocks: unknown[] = [
		{ type: "header", text: "Enrichkit" },
		{
			type: "context",
			text: "One provider call per publish whose title or body changed. Autosaves never call the provider.",
		},
	];
	if (entries.length === 0) {
		blocks.push({
			type: "section",
			text: "No enriched entries yet. Publish a post to create one.",
		});
		return { blocks };
	}
	const current = selected ?? entries[0]!.id;
	blocks.push({
		type: "form",
		block_id: "pick",
		fields: [
			{
				type: "select",
				action_id: "id",
				label: "Entry",
				options: entries.map((e) => ({ label: e.result.title || e.id, value: e.id })),
				initial_value: current,
			},
		],
		submit: { label: "Show", action_id: "show" },
	});
	blocks.push({ type: "divider" });
	blocks.push(...resultBlocks(current, entries.find((e) => e.id === current)?.result ?? null));
	return { blocks };
}

export function createPlugin(rawOptions: EnrichkitOptions = {}) {
	const options = getOptions(rawOptions);

	return definePlugin({
		id: ID,
		version: pkg.version,
		capabilities: ["content:read", "content:write", "network:request"],
		allowedHosts: [PROVIDER_HOSTS[options.provider]],
		admin: {
			pages: [{ path: "/", label: "Enrichkit", icon: "sparkles" }],
			settingsSchema: {
				apiKey: {
					type: "secret",
					label: "API key",
					description: `${options.provider === "openai" ? "OpenAI" : "Anthropic"} API key. Stored encrypted, needs EMDASH_ENCRYPTION_KEY on the server.`,
				},
			},
		},
		hooks: {
			// Publish only. Autosaves fire afterSave, so nothing paid lives there.
			"content:afterPublish": {
				timeout: options.timeoutMs + 5000,
				handler: async (event, ctx) => {
					const id = String(event.content.id ?? "");
					const data = isRecord(event.content.data) ? event.content.data : {};
					if (!id) return;
					await enrich(ctx, options, { collection: event.collection, id, data });
				},
			},
		},
		routes: {
			admin: {
				handler: async (ctx) => {
					const input = isRecord(ctx.input) ? ctx.input : {};
					if (input.type === "form_submit" && input.action_id === "show") {
						const values = isRecord(input.values) ? input.values : {};
						return adminPage(ctx, typeof values.id === "string" ? values.id : undefined);
					}
					if (input.type === "block_action" && input.action_id === "regenerate") {
						const value = isRecord(input.value) ? input.value : {};
						const id = String(value.id ?? "");
						const collection = String(value.collection ?? "");
						const item = id && collection ? await ctx.content?.get(collection, id) : null;
						if (!item) {
							return {
								...(await adminPage(ctx, id)),
								toast: { message: "Entry not found", type: "error" },
							};
						}
						const outcome = await enrich(ctx, options, { collection, id, data: item.data }, true);
						const ok = outcome.status === "enriched";
						return {
							...(await adminPage(ctx, id)),
							toast: ok
								? { message: "Regenerated", type: "success" }
								: { message: "Regenerate failed, see the server log", type: "error" },
						};
					}
					return adminPage(ctx);
				},
			},
		},
	});
}

export type { Enrichment, EnrichkitProvider, EnrichmentFlags };
