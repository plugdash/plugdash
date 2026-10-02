// @plugdash/shortlink - one EmDash native redirect per published entry.
//
// EmDash already serves redirects from middleware (cached, with hit counts and
// an admin screen). This plugin only creates `<prefix><code> -> <entry path>`
// on publish and keeps the destination current when the slug changes.
// CopyLink.astro computes the same code from the entry id at render time.

import { definePlugin } from "emdash";
import type { PluginContext, PluginDescriptor } from "emdash";
import pkg from "../package.json" with { type: "json" };
import { normalizePrefix, shortCode, shortPath } from "./code.ts";

export { normalizePrefix, shortCode, shortPath };

const ID = "shortlink";
const VERSION = pkg.version;
const GROUP = "shortlink";

export interface ShortlinkOptions {
	/** Path prefix for short links. Must match CopyLink's `prefix` prop. Default "/s/". */
	prefix?: string;
	/**
	 * Destination pattern used only when EmDash cannot give the entry's public
	 * URL and the collection has no urlPattern. Supports {collection}, {slug}
	 * and {id}. Default "/{collection}/{slug}".
	 */
	pathPattern?: string;
}

export function getOptions(options: ShortlinkOptions = {}): Required<ShortlinkOptions> {
	return {
		prefix: normalizePrefix(typeof options.prefix === "string" ? options.prefix : undefined),
		pathPattern:
			typeof options.pathPattern === "string" ? options.pathPattern : "/{collection}/{slug}",
	};
}

export function shortlinkPlugin(
	options: ShortlinkOptions = {},
): PluginDescriptor<ShortlinkOptions> {
	return {
		id: ID,
		version: VERSION,
		format: "native",
		entrypoint: "@plugdash/shortlink",
		options,
	};
}

const warned = new Set<string>();
function warnOnce(ctx: PluginContext, key: string, message: string): void {
	if (warned.has(key)) return;
	warned.add(key);
	ctx.log.warn(message);
}

/** Site-relative path of a published entry, or null if it has no public page. */
export async function entryPath(
	ctx: PluginContext,
	collection: string,
	id: string,
	slug: string | null,
	pathPattern: string,
): Promise<string | null> {
	// Best source: EmDash resolves urlPattern, locale and trailing slash.
	// Keep only the path - the origin comes from setup and can be stale.
	const url = await ctx.content?.getPublicUrl?.(collection, id);
	if (url) return new URL(url).pathname;

	// getPublicUrl is null until the site URL is known. Fall back to the pattern.
	const info = await ctx.schema?.getCollection(collection);
	if (info && !info.routable) return null;
	if (!slug) return null;
	return (info?.urlPattern ?? pathPattern)
		.replaceAll("{collection}", collection)
		.replaceAll("{slug}", slug)
		.replaceAll("{id}", id);
}

/**
 * Create the redirect, or point it at the new destination if this entry owns
 * it. A redirect with the same source that this entry does not own (another
 * entry's code, or one added by hand) is a collision: log it, change nothing.
 */
export async function ensureRedirect(
	ctx: PluginContext,
	source: string,
	destination: string,
	entryId: string,
): Promise<void> {
	const redirects = ctx.redirects;
	if (!redirects?.create || !redirects.update) {
		warnOnce(ctx, "redirects", "redirects:write is not available, no short links created");
		return;
	}
	const ownerKey = `owner:${source}`;
	// search is a LIKE on source and destination, so filter for the exact source
	const { items } = await redirects.list({ search: source, limit: 100 });
	const found = items.find((r) => r.source === source);

	if (!found) {
		await redirects.create({ source, destination, type: 301, groupName: GROUP });
		await ctx.kv.set(ownerKey, entryId);
		ctx.log.info("short link created", { source, destination });
		return;
	}
	if (found.destination === destination) return;

	const owner = await ctx.kv.get<string>(ownerKey);
	if (owner !== entryId) {
		ctx.log.error("short link collision, existing redirect left alone", {
			source,
			entryId,
			ownerEntryId: owner ?? null,
			existingDestination: found.destination,
			wantedDestination: destination,
		});
		return;
	}
	const current = await redirects.get(found.id);
	if (!current) return;
	await redirects.update(found.id, { destination, _rev: current._rev });
	ctx.log.info("short link updated", { source, destination });
}

export function createPlugin(rawOptions: ShortlinkOptions = {}) {
	const options = getOptions(rawOptions);

	return definePlugin({
		id: ID,
		version: VERSION,
		// content:read registers afterPublish and gives getPublicUrl.
		// schema:read gives the collection urlPattern for the fallback.
		capabilities: ["content:read", "schema:read", "redirects:write"],
		hooks: {
			// Publish only. Autosave fires afterSave, which this plugin ignores.
			"content:afterPublish": async (event, ctx) => {
				try {
					const id = String(event.content.id ?? "");
					if (!id) return;
					const slug = typeof event.content.slug === "string" ? event.content.slug : null;
					const destination = await entryPath(ctx, event.collection, id, slug, options.pathPattern);
					if (!destination) return;

					await ensureRedirect(ctx, shortPath(id, options.prefix), destination, id);

					// Migration from 0.2.x: keep the random code already shared working.
					const legacy = await ctx.kv.get<string>(`shortlink:by-content:${id}`);
					if (typeof legacy === "string" && legacy && legacy !== shortCode(id)) {
						await ensureRedirect(ctx, options.prefix + legacy, destination, id);
					}
				} catch (err) {
					ctx.log.error("afterPublish failed", { err: String(err) });
				}
			},
		},
	});
}

export default createPlugin;
