// @plugdash/enrichkit - sandbox entry (runs at request time)
// Standard plugin: no Node.js built-ins, no direct fetch().

import type { SandboxedPlugin, PluginContext } from "emdash/plugin";
import { isRecord } from "@plugdash/types";
import {
	buildPrompt,
	buildRequest,
	classifyStatus,
	countWords,
	enabledFields,
	extractCompletion,
	extractText,
	parseEnrichmentResponse,
	parseEnrichmentSelection,
	resolveEnrichments,
	validateConfig,
	DEFAULT_ENRICHMENTS,
	MIN_WORDS,
	type Completion,
	type EnrichkitProvider,
	type EnrichmentFlags,
	type ResolvedEnrichkitConfig,
} from "./enrich-logic.ts";
import type { EnrichkitConfig } from "./index.ts";

/** One API call per publish, so a generous ceiling beats a chatty knob. */
const REQUEST_TIMEOUT_MS = 20000;

// ── KV config ──

const KEY_PROVIDER = "enrichkit:config:provider";
const KEY_API_KEY = "enrichkit:config:apiKey";
const KEY_MODEL = "enrichkit:config:model";
const KEY_ENRICHMENTS = "enrichkit:config:enrichments";
const KEY_BOOTSTRAP_HASH = "enrichkit:bootstrapHash";

async function readRawConfig(ctx: PluginContext): Promise<Record<string, unknown>> {
	return {
		provider: await ctx.kv.get<string>(KEY_PROVIDER),
		apiKey: await ctx.kv.get<string>(KEY_API_KEY),
		model: await ctx.kv.get<string>(KEY_MODEL),
		enrichments: await ctx.kv.get<EnrichmentFlags>(KEY_ENRICHMENTS),
	};
}

function stableStringify(value: unknown): string {
	if (value === null || typeof value !== "object") return JSON.stringify(value);
	if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
	const rec = value as Record<string, unknown>;
	const keys = Object.keys(rec).sort();
	return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(rec[k])}`).join(",")}}`;
}

function hashConfig(config: EnrichkitConfig): string {
	// Non-crypto hash, used only to detect config change across restarts.
	const s = stableStringify(config);
	let hash = 0;
	for (let i = 0; i < s.length; i++) {
		hash = (hash * 31 + s.charCodeAt(i)) | 0;
	}
	return `${s.length}:${hash}`;
}

async function seedFromBootstrap(ctx: PluginContext, bootstrap: EnrichkitConfig): Promise<void> {
	await ctx.kv.set(KEY_PROVIDER, bootstrap.provider ?? "");
	await ctx.kv.set(KEY_API_KEY, bootstrap.apiKey ?? "");
	if (bootstrap.model !== undefined) {
		await ctx.kv.set(KEY_MODEL, bootstrap.model);
	}
	await ctx.kv.set(KEY_ENRICHMENTS, resolveEnrichments(bootstrap.enrichments));
	await ctx.kv.set(KEY_BOOTSTRAP_HASH, hashConfig(bootstrap));
}

async function checkAndReseedBootstrap(ctx: PluginContext): Promise<void> {
	const bootstrap = globalThis.__plugdash_enrichkit_config__;
	if (!bootstrap) return;
	const currentHash = hashConfig(bootstrap);
	const storedHash = await ctx.kv.get<string>(KEY_BOOTSTRAP_HASH);
	if (storedHash === currentHash) return;
	await seedFromBootstrap(ctx, bootstrap);
}

// ── Model call ──

/**
 * One request to the configured provider. Returns null on every failure -
 * a publish must never fail because the LLM did - after logging what went
 * wrong in terms the site owner can act on.
 */
async function callModel(
	config: ResolvedEnrichkitConfig,
	prompt: string,
	ctx: PluginContext,
): Promise<Completion | null> {
	if (!ctx.http) {
		ctx.log.error("enrichkit: network capability unavailable");
		return null;
	}

	const spec = buildRequest(config.provider, config.apiKey, config.model, prompt);
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

	try {
		const res = await ctx.http.fetch(spec.url, { ...spec.init, signal: controller.signal });
		if (res.status < 200 || res.status >= 300) {
			const failure = classifyStatus(res.status);
			if (failure === "rate_limit") {
				// Deliberately no synchronous retry: the next publish gets a fresh shot.
				ctx.log.warn("enrichkit: rate limited, skipping enrichment", {
					provider: config.provider,
					status: res.status,
				});
			} else if (failure === "quota") {
				ctx.log.error(
					"enrichkit: provider rejected the request for quota or billing reasons - top up the account or disable the plugin",
					{ provider: config.provider, status: res.status },
				);
			} else if (failure === "auth") {
				ctx.log.error("enrichkit: provider rejected the API key", {
					provider: config.provider,
					status: res.status,
				});
			} else {
				ctx.log.error("enrichkit: provider returned an error", {
					provider: config.provider,
					status: res.status,
				});
			}
			return null;
		}

		const payload: unknown = await res.json();
		const completion = extractCompletion(config.provider, payload);
		if (!completion) {
			ctx.log.error("enrichkit: could not read a completion from the provider response", {
				provider: config.provider,
			});
			return null;
		}
		return completion;
	} catch (err) {
		ctx.log.error("enrichkit: provider request failed", { err: String(err) });
		return null;
	} finally {
		clearTimeout(timeoutId);
	}
}

// ── Admin page ──

export function maskApiKey(key: string): string {
	if (!key) return "";
	return key.length <= 8 ? "set" : `${key.slice(0, 4)}...${key.slice(-4)}`;
}

export interface SettingsResult {
	ok: boolean;
	error?: string;
	provider?: EnrichkitProvider;
	apiKey?: string;
	model?: string;
	enrichments?: EnrichmentFlags;
}

/**
 * Validates an admin form submission. The API key is only overwritten when
 * a new non-empty value is submitted, so a blank field keeps the stored key
 * rather than wiping it.
 */
export function validateEnrichkitSettings(
	values: Record<string, unknown>,
	currentApiKey: string,
): SettingsResult {
	const provider = values.provider;
	if (provider !== "anthropic" && provider !== "openai") {
		return { ok: false, error: "Provider must be Anthropic or OpenAI" };
	}

	const submittedKey = typeof values.apiKey === "string" ? values.apiKey.trim() : "";
	const apiKey = submittedKey.length > 0 ? submittedKey : currentApiKey;
	if (apiKey.length === 0) {
		return { ok: false, error: "An API key is required" };
	}

	const model = typeof values.model === "string" ? values.model.trim() : "";
	const enrichments = parseEnrichmentSelection(values.enrichments);
	if (enabledFields(enrichments).length === 0) {
		return { ok: false, error: "Enable at least one enrichment" };
	}

	return { ok: true, provider, apiKey, model, enrichments };
}

async function buildSettingsPage(ctx: PluginContext) {
	const provider = (await ctx.kv.get<string>(KEY_PROVIDER)) ?? "";
	const apiKey = (await ctx.kv.get<string>(KEY_API_KEY)) ?? "";
	const model = (await ctx.kv.get<string>(KEY_MODEL)) ?? "";
	const enrichments = resolveEnrichments(await ctx.kv.get<EnrichmentFlags>(KEY_ENRICHMENTS));

	return {
		blocks: [
			{ type: "header", text: "Enrichkit Settings" },
			{
				type: "context",
				text: "One LLM call per publish adds a summary, topics, tags, and a tweet draft to post metadata.",
			},
			{ type: "divider" },
			...(apiKey
				? [
						{
							type: "fields",
							fields: [{ label: "Current API key", value: maskApiKey(apiKey) }],
						},
					]
				: []),
			{
				type: "form",
				block_id: "enrichkit-settings",
				fields: [
					{
						type: "select",
						action_id: "provider",
						label: "Provider",
						options: [
							{ label: "Anthropic", value: "anthropic" },
							{ label: "OpenAI", value: "openai" },
						],
						initial_value: provider || "anthropic",
					},
					{
						type: "text_input",
						action_id: "apiKey",
						label: "API key",
						placeholder: "sk-...",
						initial_value: "",
						help_text: "Kept private - leave blank to keep the existing value.",
					},
					{
						type: "text_input",
						action_id: "model",
						label: "Model (optional)",
						placeholder: "claude-haiku-4-5",
						initial_value: model,
						help_text: "Leave blank to use the provider default.",
					},
					{
						type: "checkbox",
						action_id: "enrichments",
						label: "Enrichments",
						options: [
							{ label: "Summary (2-3 sentences)", value: "summary" },
							{ label: "Key topics", value: "keyTopics" },
							{ label: "Reading level", value: "readingLevel" },
							{ label: "Auto tags", value: "autoTags" },
							{ label: "Tweet draft", value: "tweetDraft" },
						],
						initial_value: enabledFields(enrichments),
					},
				],
				submit: { label: "Save", action_id: "save_settings" },
			},
		],
	};
}

async function handleSaveSettings(values: Record<string, unknown>, ctx: PluginContext) {
	const currentApiKey = (await ctx.kv.get<string>(KEY_API_KEY)) ?? "";
	const result = validateEnrichkitSettings(values, currentApiKey);
	if (!result.ok) {
		const page = await buildSettingsPage(ctx);
		return { ...page, toast: { message: result.error, type: "error" } };
	}
	await ctx.kv.set(KEY_PROVIDER, result.provider!);
	await ctx.kv.set(KEY_API_KEY, result.apiKey!);
	await ctx.kv.set(KEY_MODEL, result.model ?? "");
	await ctx.kv.set(KEY_ENRICHMENTS, result.enrichments!);
	const page = await buildSettingsPage(ctx);
	return { ...page, toast: { message: "Settings saved", type: "success" } };
}

// ── Plugin definition ──

export default {
	hooks: {
		"plugin:install": {
			handler: async (_event: unknown, ctx: PluginContext) => {
				try {
					const bootstrap = globalThis.__plugdash_enrichkit_config__;
					if (bootstrap) {
						await seedFromBootstrap(ctx, bootstrap);
						ctx.log.info("enrichkit: installed", { provider: bootstrap.provider });
					} else {
						await ctx.kv.set(KEY_ENRICHMENTS, DEFAULT_ENRICHMENTS);
						ctx.log.info("enrichkit: installed with empty config");
					}
					const apiKey = await ctx.kv.get<string>(KEY_API_KEY);
					if (!apiKey) {
						ctx.log.warn(
							"enrichkit: apiKey not configured - plugin will no-op until configured",
						);
					}
				} catch (err) {
					ctx.log.error("enrichkit: install failed", { err: String(err) });
				}
			},
		},

		"content:afterSave": {
			handler: async (
				event: { content: Record<string, unknown>; collection: string },
				ctx: PluginContext,
			) => {
				try {
					if (event.content.status !== "published") return;

					await checkAndReseedBootstrap(ctx);
					const check = validateConfig(await readRawConfig(ctx));
					if (!check.ok) {
						ctx.log.error("enrichkit: not configured, skipping", { reason: check.error });
						return;
					}
					const config = check.value;

					if (!ctx.content?.update) {
						ctx.log.error("enrichkit: content write capability unavailable");
						return;
					}

					const data = isRecord(event.content.data) ? event.content.data : {};
					const bodyText = extractText(data.body);
					const wordCount = countWords(bodyText);
					if (wordCount < MIN_WORDS) {
						ctx.log.info("enrichkit: content too short to enrich, skipping", {
							id: event.content.id,
							wordCount,
						});
						return;
					}

					const title = typeof data.title === "string" ? data.title : "";
					const prompt = buildPrompt(title, bodyText, config.enrichments);

					const first = await callModel(config, prompt, ctx);
					if (!first) return;
					let parsed = parseEnrichmentResponse(first.text, config.enrichments);
					let tokens = first.tokens;
					if (!parsed.ok) {
						ctx.log.warn("enrichkit: model returned unusable JSON, retrying once", {
							reason: parsed.error,
						});
						const second = await callModel(config, prompt, ctx);
						if (!second) return;
						parsed = parseEnrichmentResponse(second.text, config.enrichments);
						tokens = second.tokens;
						if (!parsed.ok) {
							ctx.log.error("enrichkit: model returned unusable JSON twice, skipping", {
								reason: parsed.error,
							});
							return;
						}
					}

					const fields = Object.keys(parsed.value);
					if (fields.length === 0) {
						ctx.log.warn("enrichkit: model returned no usable fields, skipping");
						return;
					}

					const id = String(event.content.id);
					const existing = await ctx.content.get(event.collection, id);
					const existingData = isRecord(existing?.data) ? existing.data : {};
					const existingMetadata = isRecord(existingData.metadata) ? existingData.metadata : {};

					await ctx.content.update(event.collection, id, {
						metadata: {
							...existingMetadata,
							enrichkit: {
								...parsed.value,
								generatedAt: new Date().toISOString(),
								model: config.model,
							},
						},
					});

					ctx.log.info("enrichkit: enriched", { id, fields, tokens });
				} catch (err) {
					// An enrichment failure must never fail the publish.
					ctx.log.error("enrichkit: afterSave failed", { err: String(err) });
				}
			},
		},
	},

	routes: {
		admin: {
			handler: async (routeCtx: { input: unknown }, ctx: PluginContext) => {
				const interaction = routeCtx.input as {
					type?: string;
					action_id?: string;
					values?: Record<string, unknown>;
				} | null;
				if (!interaction || interaction.type === "page_load" || interaction.type === undefined) {
					return buildSettingsPage(ctx);
				}
				if (interaction.type === "form_submit" && interaction.action_id === "save_settings") {
					return handleSaveSettings(interaction.values ?? {}, ctx);
				}
				return buildSettingsPage(ctx);
			},
		},
	},
} satisfies SandboxedPlugin;

export type { EnrichkitConfig, EnrichkitProvider, EnrichmentFlags };
