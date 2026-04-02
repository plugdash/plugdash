// @plugdash/readtime - sandbox entry (runs at request time)
// Standard plugin: no Node.js built-ins, no direct fetch()

import { definePlugin } from "emdash";
import type { PluginContext, ContentHookEvent } from "emdash";
import type {
	PortableTextBlock,
	PortableTextSpan,
} from "@portabletext/types";
import { isRecord } from "@plugdash/types";

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

// ── Config from KV ──

async function getConfig(ctx: PluginContext) {
	const wordsPerMinute =
		(await ctx.kv.get<number>("config:wordsPerMinute")) ?? 238;
	// config:collections is intentionally not seeded at install time.
	// null means "process all collections" - this is the desired default.
	const collections =
		await ctx.kv.get<string[]>("config:collections");
	return { wordsPerMinute, collections };
}

// ── Plugin definition ──

export default definePlugin({
	hooks: {
		"plugin:install": {
			handler: async (_event: unknown, ctx: PluginContext) => {
				await ctx.kv.set("config:wordsPerMinute", 238);
				// config:collections intentionally not seeded - null means all collections
				ctx.log.info("readtime: installed with default config");
			},
		},

		"content:afterSave": {
			handler: async (event: ContentHookEvent, ctx: PluginContext) => {
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

				// Write only the metadata column - other data columns are untouched
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
			},
		},
	},
});
