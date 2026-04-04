// @plugdash/sharepost - sandbox entry (runs at request time)
// Standard plugin: no Node.js built-ins, no direct fetch()

import { definePlugin } from "emdash";
import type { PluginContext, ContentHookEvent } from "emdash";
import { isRecord } from "@plugdash/types";

type Platform = "twitter" | "linkedin" | "whatsapp" | "bluesky" | "email";

const ALL_PLATFORMS: Platform[] = ["twitter", "linkedin", "whatsapp", "bluesky", "email"];

// ── Pure functions (exported for testing) ──

export interface ShareUrlArgs {
	title: string;
	url: string;
	via?: string;
	hashtags?: string[];
}

export function generateShareUrl(platform: Platform, args: ShareUrlArgs): string {
	const { url, via, hashtags } = args;
	// Twitter truncates title to 200 chars
	const title = platform === "twitter" && args.title.length > 200
		? args.title.slice(0, 200) + "..."
		: args.title;

	switch (platform) {
		case "twitter": {
			const params = new URLSearchParams();
			params.set("text", title);
			params.set("url", url);
			if (via) params.set("via", via);
			if (hashtags && hashtags.length > 0) params.set("hashtags", hashtags.join(","));
			return `https://twitter.com/intent/tweet?${params.toString()}`;
		}
		case "linkedin":
			return `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`;
		case "whatsapp":
			return `https://api.whatsapp.com/send?text=${encodeURIComponent(title + " " + url)}`;
		case "bluesky":
			return `https://bsky.app/intent/compose?text=${encodeURIComponent(title + " " + url)}`;
		case "email":
			return `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(title + "\n\n" + url)}`;
	}
}

export interface AllShareUrlArgs {
	title: string;
	url: string;
	platforms: Platform[];
	via?: string;
	hashtags?: string[];
}

export function generateAllShareUrls(args: AllShareUrlArgs): Record<string, string> {
	const result: Record<string, string> = {};
	for (const platform of args.platforms) {
		result[platform] = generateShareUrl(platform, {
			title: args.title,
			url: args.url,
			via: args.via,
			hashtags: args.hashtags,
		});
	}
	return result;
}

// ── Config from KV ──

async function getConfig(ctx: PluginContext) {
	const platforms = (await ctx.kv.get<Platform[]>("config:platforms")) ?? ALL_PLATFORMS;
	const via = await ctx.kv.get<string>("config:via");
	const hashtags = await ctx.kv.get<string[]>("config:hashtags");
	return { platforms, via: via ?? undefined, hashtags: hashtags ?? undefined };
}

// ── Plugin definition ──

export default definePlugin({
	hooks: {
		"plugin:install": {
			handler: async (_event: unknown, ctx: PluginContext) => {
				await ctx.kv.set("config:platforms", ALL_PLATFORMS);
				// config:via and config:hashtags intentionally not seeded - null means disabled
				ctx.log.info("sharepost: installed with default config");
			},
		},

		"content:afterSave": {
			handler: async (event: ContentHookEvent, ctx: PluginContext) => {
				try {
					// Only process published content
					if (event.content.status !== "published") return;

					// Guard: content capability required
					if (!ctx.content) {
						ctx.log.error(
							"sharepost: content capability unavailable - check plugin capabilities",
						);
						return;
					}

					// Need a slug to build the post URL
					const slug = event.content.slug as string | null;
					if (!slug) {
						ctx.log.warn("sharepost: no slug on content, skipping share URL generation");
						return;
					}

					const { platforms, via, hashtags } = await getConfig(ctx);

					// Get title from data (confirmed: title is a custom data field, not system)
					const contentData = isRecord(event.content.data)
						? event.content.data
						: {};
					const title = typeof contentData.title === "string" && contentData.title.length > 0
						? contentData.title
						: event.collection;

					// Build absolute URL
					const postUrl = ctx.url(`/${event.collection}/${slug}`);

					// Generate share URLs
					const shareUrls = generateAllShareUrls({
						title,
						url: postUrl,
						platforms,
						via,
						hashtags,
					});

					// Read existing content to merge metadata safely
					const id = event.content.id as string;
					const existing = await ctx.content.get(event.collection, id);
					const existingData = isRecord(existing?.data)
						? existing!.data
						: {};
					const existingMetadata = isRecord(existingData.metadata)
						? (existingData.metadata as Record<string, unknown>)
						: {};

					// Write only the metadata column - other data columns are untouched
					await ctx.content.update!(event.collection, id, {
						metadata: {
							...existingMetadata,
							shareUrls,
						},
					});

					ctx.log.info("sharepost: updated share URLs", {
						id,
						platforms: Object.keys(shareUrls),
					});
				} catch (err) {
					ctx.log.error("sharepost: failed to generate share URLs", { err });
				}
			},
		},
	},
});
