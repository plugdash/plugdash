// @plugdash/socialcard - native EmDash plugin
//
// socialcardPlugin(options) runs in astro.config.mjs and returns the
// descriptor. EmDash inlines `options` as JSON and calls createPlugin(options)
// in the server, in dev and in production.

import { definePlugin } from "emdash";
import type { PluginContext, PluginDescriptor } from "emdash";
import pkg from "../package.json" with { type: "json" };
import { CARD_MIME, cardFilename, renderCard, resolveConfig } from "./card.ts";
import type { CardInput } from "./card.ts";

const ID = "socialcard";
const VERSION: string = pkg.version;

export interface SocialcardConfig {
	/** Built-in card template. Default: "default". */
	template?: "default" | "minimal" | "bold";
	/** Card width in pixels. Default: 1200. */
	width?: number;
	/** Card height in pixels. Default: 630. */
	height?: number;
	/** Background colour. Default: "#0f172a". */
	background?: string;
	/** Foreground (text) colour. Default: "#f8fafc". */
	foreground?: string;
	/**
	 * Logo drawn in the top-left corner: an absolute http(s) URL, or a file
	 * path on the server (Node only). PNG, JPEG, GIF, WebP or SVG.
	 */
	logo?: string;
	/**
	 * Extra TTF/OTF font files, as http(s) URLs or file paths (Node only).
	 * Used for any glyph the bundled Lexend (Latin) does not have, for example
	 * Noto Sans Devanagari for Hindi titles.
	 */
	fontFiles?: string[];
	/** Replace an SEO image someone set by hand. Default: false. */
	overwriteSeoImage?: boolean;
}

interface StoredMedia {
	mediaId: string;
	url: string;
}

// ── field extraction ──

function isRecord(v: unknown): v is Record<string, unknown> {
	return typeof v === "object" && v !== null && !Array.isArray(v);
}

function text(v: unknown): string | null {
	return typeof v === "string" && v.trim().length > 0 ? v : null;
}

/** Falls back through title -> slug -> id so a card always has a heading. */
export function pickTitle(content: Record<string, unknown>): string {
	const data = isRecord(content.data) ? content.data : {};
	return text(data.title) ?? text(content.slug) ?? String(content.id ?? "untitled");
}

/** `data.author` (string or `{ name }`), else the primary byline. */
export function pickAuthor(content: Record<string, unknown>): string | null {
	const data = isRecord(content.data) ? content.data : {};
	if (text(data.author)) return data.author as string;
	if (isRecord(data.author) && text(data.author.name)) return data.author.name as string;
	if (isRecord(content.byline) && text(content.byline.displayName)) {
		return content.byline.displayName as string;
	}
	return null;
}

export function pickPublishedAt(content: Record<string, unknown>): string | null {
	return text(content.publishedAt) ?? text(content.updatedAt);
}

/** Everything that changes the picture, so an unchanged card is never redrawn. */
export async function cardHash(input: CardInput, config: SocialcardConfig): Promise<string> {
	const raw = JSON.stringify([input.title, input.author, input.publishedAt, config, VERSION]);
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
	return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

// ── warn once (rule H) ──

const warned = new Set<string>();

function warnOnce(ctx: PluginContext, key: string, message: string): void {
	if (warned.has(key)) return;
	warned.add(key);
	ctx.log.warn(message);
}

// ── descriptor factory (astro.config.mjs) ──

export function socialcardPlugin(
	options: SocialcardConfig = {},
): PluginDescriptor<SocialcardConfig> {
	return {
		id: ID,
		version: VERSION,
		format: "native",
		entrypoint: "@plugdash/socialcard",
		options,
	};
}

// ── runtime plugin (server) ──

export function createPlugin(options: SocialcardConfig = {}) {
	return definePlugin({
		id: ID,
		version: VERSION,
		capabilities: ["content:read", "content:write", "media:write", "schema:read"],
		hooks: {
			"content:afterPublish": {
				// Rendering runs after the publish response, so this only
				// bounds how long a slow logo or font fetch may take.
				timeout: 30_000,
				handler: async (event, ctx) => {
					const id = String(event.content.id);
					const { media, content } = ctx;
					if (!media?.upload || !media.delete || !content?.update) {
						warnOnce(ctx, "caps", "content:write or media:write is missing, no cards");
						return;
					}
					try {
						const schema = await ctx.schema?.getCollection(event.collection);
						if (!schema?.hasSeo) {
							warnOnce(
								ctx,
								`noseo:${event.collection}`,
								`collection "${event.collection}" has no SEO support, no cards for it`,
							);
							return;
						}

						const entry = await content.get(event.collection, id);
						const currentImage = entry?.seo?.image ?? null;
						const previous = await ctx.kv.get<StoredMedia>(`media:${id}`);
						if (currentImage && currentImage !== previous?.url && !options.overwriteSeoImage) {
							ctx.log.info("SEO image was set by hand, leaving it", { id });
							return;
						}

						const input: CardInput = {
							title: pickTitle(event.content),
							author: pickAuthor(event.content),
							publishedAt: pickPublishedAt(event.content),
						};
						const hash = await cardHash(input, options);
						if (currentImage && (await ctx.kv.get<string>(`hash:${id}`)) === hash) {
							ctx.log.info("card unchanged, skipping render", { id });
							return;
						}

						const started = performance.now();
						const { svgToPng, loadBytes, toDataUri } = await import("./render.ts");
						const logo = options.logo ? toDataUri(await loadBytes(options.logo)) : undefined;
						const fonts = await Promise.all((options.fontFiles ?? []).map(loadBytes));
						const png = await svgToPng(renderCard(input, { ...options, logo }), fonts);
						const renderMs = Math.round(performance.now() - started);

						const uploaded = await media.upload(
							cardFilename(id),
							CARD_MIME,
							png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength) as ArrayBuffer,
						);
						// seo-only update: goes to the SEO table, not a draft, so
						// it is live at once.
						await content.update(event.collection, id, { seo: { image: uploaded.url } });
						await ctx.kv.set(`media:${id}`, { mediaId: uploaded.mediaId, url: uploaded.url });
						await ctx.kv.set(`hash:${id}`, hash);

						// Every upload gets a new storage key, so drop the old card.
						if (previous && previous.mediaId !== uploaded.mediaId) {
							await media
								.delete(previous.mediaId)
								.catch((err: unknown) =>
									ctx.log.warn("could not delete previous card", { id, err: String(err) }),
								);
						}

						ctx.log.info("card generated", {
							id,
							url: uploaded.url,
							bytes: png.byteLength,
							renderMs,
							template: resolveConfig(options).template,
						});
					} catch (err) {
						ctx.log.error("card generation failed", { id, err: String(err) });
					}
				},
			},
		},
	});
}

export default createPlugin;
