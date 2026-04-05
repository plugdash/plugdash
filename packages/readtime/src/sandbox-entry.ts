// @plugdash/readtime - sandbox entry (runs at request time)
// Standard plugin: no Node.js built-ins, no direct fetch()

import { definePlugin } from "emdash";
import type { PluginContext, ContentHookEvent } from "emdash";
import type {
	PortableTextBlock,
	PortableTextSpan,
} from "@portabletext/types";
import { isRecord } from "@plugdash/types";
import type { ReadtimeConfig } from "./index.ts";

// ── Pure functions (exported for testing) ──

export function extractText(body: PortableTextBlock[]): string {
	return body
		.filter((block) => block._type === "block")
		.flatMap((block) => ((block.children ?? []) as PortableTextSpan[]))
		.filter((child) => child._type === "span")
		.map((child) => child.text ?? "")
		.join(" ");
}

export function calculateReadingTime(
	text: string,
	wordsPerMinute: number,
): { wordCount: number; minutes: number } {
	const words = text.split(/\s+/).filter((w) => w.length > 0);
	const wordCount = words.length;
	const minutes = Math.max(1, Math.ceil(wordCount / wordsPerMinute));
	return { wordCount, minutes };
}

// ── Config hash (stable, non-crypto) ──

function stableStringify(value: unknown): string {
	if (value === null || typeof value !== "object") return JSON.stringify(value);
	if (Array.isArray(value)) {
		return `[${value.map(stableStringify).join(",")}]`;
	}
	const rec = value as Record<string, unknown>;
	const keys = Object.keys(rec).sort();
	return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(rec[k])}`).join(",")}}`;
}

export function hashConfig(config: ReadtimeConfig): string {
	const s = stableStringify(config);
	let hash = 0;
	for (let i = 0; i < s.length; i++) {
		hash = (hash * 31 + s.charCodeAt(i)) | 0;
	}
	return `${s.length}:${hash}`;
}

// ── Config from KV ──

async function getConfig(ctx: PluginContext) {
	const wordsPerMinute =
		(await ctx.kv.get<number>("config:wordsPerMinute")) ?? 238;
	// null means "process all collections" - this is the desired default
	// when no bootstrap collections were supplied.
	const collections =
		await ctx.kv.get<string[] | null>("config:collections");
	return { wordsPerMinute, collections: collections ?? null };
}

// ── Bootstrap bridge (trusted mode only) ──

async function seedFromBootstrap(
	ctx: PluginContext,
	bootstrap: ReadtimeConfig,
): Promise<void> {
	await ctx.kv.set(
		"config:wordsPerMinute",
		bootstrap.wordsPerMinute ?? 238,
	);
	// Seed collections explicitly. When bootstrap.collections is undefined,
	// write null so getConfig sees an explicit "all collections" signal.
	await ctx.kv.set(
		"config:collections",
		bootstrap.collections ?? null,
	);
	await ctx.kv.set("readtime:bootstrapHash", hashConfig(bootstrap));
}

async function seedDefaults(ctx: PluginContext): Promise<void> {
	await ctx.kv.set("config:wordsPerMinute", 238);
	await ctx.kv.set("config:collections", null);
}

async function checkAndReseedBootstrap(ctx: PluginContext): Promise<void> {
	const bootstrap = globalThis.__plugdash_readtime_config__;
	if (!bootstrap) return;
	const currentHash = hashConfig(bootstrap);
	const storedHash = await ctx.kv.get<string>("readtime:bootstrapHash");
	if (storedHash === currentHash) return;
	await seedFromBootstrap(ctx, bootstrap);
}

// ── Admin page helpers ──

function parseCollections(input: unknown): string[] | null {
	if (typeof input !== "string") return null;
	const trimmed = input.trim();
	if (trimmed.length === 0) return null;
	const list = trimmed
		.split(",")
		.map((s) => s.trim())
		.filter((s) => s.length > 0);
	return list.length > 0 ? list : null;
}

function collectionsToString(value: string[] | null): string {
	if (!value || value.length === 0) return "";
	return value.join(", ");
}

export function validateReadtimeSettings(values: Record<string, unknown>): {
	ok: boolean;
	error?: string;
	wordsPerMinute?: number;
	collections?: string[] | null;
} {
	const wpmRaw = values.wordsPerMinute;
	const wpm = typeof wpmRaw === "number" ? wpmRaw : Number(wpmRaw);
	if (!Number.isFinite(wpm) || !Number.isInteger(wpm) || wpm < 100 || wpm > 500) {
		return { ok: false, error: "Words per minute must be an integer between 100 and 500" };
	}
	const collections = parseCollections(values.collections);
	return { ok: true, wordsPerMinute: wpm, collections };
}

async function buildSettingsPage(ctx: PluginContext) {
	const wordsPerMinute =
		(await ctx.kv.get<number>("config:wordsPerMinute")) ?? 238;
	const collections = await ctx.kv.get<string[] | null>("config:collections");

	return {
		blocks: [
			{ type: "header", text: "Reading Time Settings" },
			{
				type: "context",
				text: "Configure reading time. Changes take effect on the next publish.",
			},
			{ type: "divider" },
			{
				type: "form",
				block_id: "readtime-settings",
				fields: [
					{
						type: "number_input",
						action_id: "wordsPerMinute",
						label: "Words per minute",
						placeholder: "238",
						min: 100,
						max: 500,
						initial_value: wordsPerMinute,
						help_text: "Average adult reading speed is 238 wpm.",
					},
					{
						type: "text_input",
						action_id: "collections",
						label: "Collections (comma-separated, leave blank for all)",
						placeholder: "blog, notes",
						initial_value: collectionsToString(collections ?? null),
						help_text:
							"Only these collections will have reading time calculated.",
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
	const result = validateReadtimeSettings(values);
	if (!result.ok) {
		const page = await buildSettingsPage(ctx);
		return { ...page, toast: { message: result.error, type: "error" } };
	}
	await ctx.kv.set("config:wordsPerMinute", result.wordsPerMinute!);
	await ctx.kv.set("config:collections", result.collections ?? null);
	const page = await buildSettingsPage(ctx);
	return { ...page, toast: { message: "Settings saved", type: "success" } };
}

// ── Plugin definition ──

export default definePlugin({
	hooks: {
		"plugin:install": {
			handler: async (_event: unknown, ctx: PluginContext) => {
				try {
					const bootstrap = globalThis.__plugdash_readtime_config__;
					if (bootstrap) {
						await seedFromBootstrap(ctx, bootstrap);
						ctx.log.info("readtime: installed from bootstrap config", {
							collections: bootstrap.collections ?? "all",
							wordsPerMinute: bootstrap.wordsPerMinute ?? 238,
						});
					} else {
						await seedDefaults(ctx);
						ctx.log.info("readtime: installed with default config");
					}
				} catch (err) {
					ctx.log.error("readtime: install failed", { err: String(err) });
				}
			},
		},

		"content:afterSave": {
			handler: async (event: ContentHookEvent, ctx: PluginContext) => {
				try {
					// Reseed KV if the bootstrap config in code has changed since
					// the last run (covers the case where a dev edits their
					// astro.config.mjs collections list and restarts the site).
					await checkAndReseedBootstrap(ctx);

					// Only process published content
					if (event.content.status !== "published") return;

					// Guard: content capability required
					if (!ctx.content) {
						ctx.log.error(
							"readtime: content capability unavailable - check plugin capabilities",
						);
						return;
					}

					const { wordsPerMinute, collections } = await getConfig(ctx);

					// If collections allowlist is set, check membership
					if (collections && !collections.includes(event.collection)) return;

					// Extract body from the nested data field
					const contentData = isRecord(event.content.data)
						? event.content.data
						: {};
					const body = Array.isArray(contentData.body)
						? (contentData.body as PortableTextBlock[])
						: [];

					// Calculate reading time
					const text = extractText(body);
					const { wordCount, minutes: readingTimeMinutes } =
						calculateReadingTime(text, wordsPerMinute);

					// Read existing content to merge metadata safely
					const id = event.content.id as string;
					const existing = await ctx.content.get(event.collection, id);
					const existingData = isRecord(existing?.data)
						? existing!.data
						: {};
					const existingMetadata = isRecord(existingData.metadata)
						? (existingData.metadata as Record<string, unknown>)
						: {};

					// Write only the metadata column - other data columns are
					// untouched. May throw if target collection has no metadata
					// field; caught below and logged rather than failing the save.
					await ctx.content.update!(event.collection, id, {
						metadata: {
							...existingMetadata,
							wordCount,
							readingTimeMinutes,
						},
					});

					ctx.log.info("readtime: updated", {
						id,
						wordCount,
						readingTimeMinutes,
					});
				} catch (err) {
					// Hooks must never throw to the host - the content save has
					// already happened and we do not want to fail it.
					ctx.log.error("readtime: afterSave failed", {
						err: String(err),
						collection: event.collection,
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
					page?: string;
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
