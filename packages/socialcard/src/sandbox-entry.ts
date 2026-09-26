// @plugdash/socialcard - sandbox entry (runs at request time)
// Standard plugin: no Node.js built-ins, no direct fetch()

import type { SandboxedPlugin, PluginContext } from "emdash/plugin";
import { isRecord } from "@plugdash/types";
import type { SocialcardConfig } from "./index.ts";
import { renderCard, resolveConfig, cardFilename, CARD_MIME } from "./card.ts";

const CONFIG_KEY = "config";
const HASH_KEY = "socialcard:bootstrapHash";

// ── Config from KV ──

export async function getConfig(ctx: PluginContext): Promise<SocialcardConfig> {
	const stored = await ctx.kv.get<SocialcardConfig>(CONFIG_KEY);
	return isRecord(stored) ? (stored as SocialcardConfig) : {};
}

async function seed(
	ctx: PluginContext,
	config: SocialcardConfig,
): Promise<void> {
	await ctx.kv.set(CONFIG_KEY, config);
	await ctx.kv.set(HASH_KEY, JSON.stringify(config));
}

/**
 * Reseeds KV when the config in astro.config.mjs has changed since the last
 * run. Key order comes from the user's object literal, so a plain stringify
 * is a stable enough fingerprint for "did the developer edit this".
 */
async function checkAndReseedBootstrap(ctx: PluginContext): Promise<void> {
	const bootstrap = globalThis.__plugdash_socialcard_config__;
	if (!bootstrap) return;
	const current = JSON.stringify(bootstrap);
	const stored = await ctx.kv.get<string>(HASH_KEY);
	if (stored === current) return;
	await seed(ctx, bootstrap);
}

// ── Field extraction ──

/** Falls back through title -> slug -> id so a card always has a heading. */
export function pickTitle(content: Record<string, unknown>): string {
	const data = isRecord(content.data) ? content.data : {};
	const title = data.title;
	if (typeof title === "string" && title.trim().length > 0) return title;
	const slug = content.slug;
	if (typeof slug === "string" && slug.trim().length > 0) return slug;
	return String(content.id ?? "untitled");
}

export function pickAuthor(content: Record<string, unknown>): string | null {
	const data = isRecord(content.data) ? content.data : {};
	const author = data.author;
	if (typeof author === "string" && author.trim().length > 0) return author;
	// Some collections nest the author as a relation object.
	if (isRecord(author) && typeof author.name === "string") return author.name;
	return null;
}

export function pickPublishedAt(
	content: Record<string, unknown>,
): string | null {
	const publishedAt = content.publishedAt;
	if (typeof publishedAt === "string" && publishedAt.length > 0) {
		return publishedAt;
	}
	const updatedAt = content.updatedAt;
	return typeof updatedAt === "string" && updatedAt.length > 0
		? updatedAt
		: null;
}

// ── Plugin definition ──

export default {
	hooks: {
		"plugin:install": {
			handler: async (_event, ctx) => {
				try {
					const bootstrap = globalThis.__plugdash_socialcard_config__ ?? {};
					await seed(ctx, bootstrap);
					ctx.log.info("socialcard: installed", {
						template: resolveConfig(bootstrap).template,
					});
				} catch (err) {
					ctx.log.error("socialcard: install failed", { err: String(err) });
				}
			},
		},

		"content:afterSave": {
			handler: async (event, ctx) => {
				try {
					await checkAndReseedBootstrap(ctx);

					// Only generate cards for published content
					if (event.content.status !== "published") return;

					if (!ctx.content?.update) {
						ctx.log.error(
							"socialcard: content:write capability unavailable - check plugin capabilities",
						);
						return;
					}
					if (!ctx.media?.upload) {
						ctx.log.error(
							"socialcard: media:write capability unavailable - check plugin capabilities",
						);
						return;
					}

					const id = String(event.content.id);
					const config = await getConfig(ctx);

					const svg = renderCard(
						{
							title: pickTitle(event.content),
							author: pickAuthor(event.content),
							publishedAt: pickPublishedAt(event.content),
						},
						config,
					);

					// Same filename every time, so a republish overwrites the
					// previous card instead of accumulating orphaned assets.
					const bytes = new TextEncoder().encode(svg);
					const uploaded = await ctx.media.upload(
						cardFilename(id),
						CARD_MIME,
						// Slice rather than pass .buffer - the encoder is free to
						// hand back a view over a larger allocation.
						bytes.buffer.slice(
							bytes.byteOffset,
							bytes.byteOffset + bytes.byteLength,
						) as ArrayBuffer,
					);

					// Read existing content to merge metadata safely
					const existing = await ctx.content.get(event.collection, id);
					const existingData = isRecord(existing?.data) ? existing.data : {};
					const existingMetadata = isRecord(existingData.metadata)
						? (existingData.metadata as Record<string, unknown>)
						: {};

					await ctx.content.update(event.collection, id, {
						metadata: {
							...existingMetadata,
							ogImage: uploaded.url,
						},
					});

					ctx.log.info("socialcard: generated", {
						id,
						url: uploaded.url,
						template: resolveConfig(config).template,
					});
				} catch (err) {
					// Hooks must never throw to the host - the content save has
					// already happened and we do not want to fail it.
					ctx.log.error("socialcard: afterSave failed", {
						err: String(err),
						collection: event.collection,
					});
				}
			},
		},
	},
} satisfies SandboxedPlugin;
