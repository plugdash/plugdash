// @plugdash/tocgen - sandbox entry (runs at request time)
// Standard plugin: no Node.js built-ins, no direct fetch()

import { definePlugin } from "emdash";
import type { PluginContext, ContentHookEvent } from "emdash";
import type {
	PortableTextBlock,
	PortableTextSpan,
} from "@portabletext/types";
import { isRecord } from "@plugdash/types";

// ── Types ──

export interface TocEntry {
	id: string;
	text: string;
	level: 2 | 3 | 4;
	children: TocEntry[];
}

interface RawHeading {
	level: number;
	text: string;
}

interface FlatHeading {
	id: string;
	text: string;
	level: number;
}

// ── Pure functions (exported for testing) ──

const HEADING_STYLES = new Set(["h2", "h3", "h4"]);

export function extractHeadings(body: PortableTextBlock[]): RawHeading[] {
	const headings: RawHeading[] = [];

	for (const block of body) {
		if (block._type !== "block") continue;
		if (!HEADING_STYLES.has(block.style as string)) continue;

		const text = ((block.children ?? []) as PortableTextSpan[])
			.filter((c) => c._type === "span")
			.map((c) => c.text ?? "")
			.join("");

		if (text.trim().length === 0) continue;

		headings.push({
			level: parseInt((block.style as string).replace("h", ""), 10),
			text,
		});
	}

	return headings;
}

export function toAnchor(text: string): string {
	return text
		.toLowerCase()
		.replace(/[^a-z0-9\s-]/g, "")
		.trim()
		.replace(/\s+/g, "-");
}

export function deduplicateAnchors(
	headings: RawHeading[],
): FlatHeading[] {
	const seen = new Map<string, number>();

	return headings.map((h) => {
		const base = toAnchor(h.text);
		const count = seen.get(base) ?? 0;
		seen.set(base, count + 1);

		return {
			id: count === 0 ? base : `${base}-${count + 1}`,
			text: h.text,
			level: h.level,
		};
	});
}

export function nestHeadings(
	flat: FlatHeading[],
	maxDepth: number,
): TocEntry[] {
	const root: TocEntry[] = [];
	let currentH2: TocEntry | null = null;
	let currentH3: TocEntry | null = null;

	for (const heading of flat) {
		if (heading.level > maxDepth) continue;

		const entry: TocEntry = {
			id: heading.id,
			text: heading.text,
			level: heading.level as 2 | 3 | 4,
			children: [],
		};

		if (heading.level === 2) {
			root.push(entry);
			currentH2 = entry;
			currentH3 = null;
		} else if (heading.level === 3) {
			if (currentH2) {
				currentH2.children.push(entry);
			} else {
				// Orphaned h3 - promote to top level
				root.push(entry);
			}
			currentH3 = entry;
		} else if (heading.level === 4) {
			if (currentH3) {
				currentH3.children.push(entry);
			} else if (currentH2) {
				currentH2.children.push(entry);
			} else {
				root.push(entry);
			}
		}
	}

	return root;
}

// ── Config from KV ──

async function getConfig(ctx: PluginContext) {
	const minHeadings =
		(await ctx.kv.get<number>("config:minHeadings")) ?? 3;
	const maxDepth =
		(await ctx.kv.get<number>("config:maxDepth")) ?? 3;
	const collections =
		await ctx.kv.get<string[]>("config:collections");
	return { minHeadings, maxDepth, collections };
}

// ── Plugin definition ──

export default definePlugin({
	hooks: {
		"plugin:install": {
			handler: async (_event: unknown, ctx: PluginContext) => {
				await ctx.kv.set("config:minHeadings", 3);
				await ctx.kv.set("config:maxDepth", 3);
				ctx.log.info("tocgen: installed with default config");
			},
		},

		"content:afterSave": {
			handler: async (event: ContentHookEvent, ctx: PluginContext) => {
				try {
					if (event.content.status !== "published") return;

					if (!ctx.content) {
						ctx.log.error(
							"tocgen: content capability unavailable - check plugin capabilities",
						);
						return;
					}

					const { minHeadings, maxDepth, collections } =
						await getConfig(ctx);

					if (collections && !collections.includes(event.collection))
						return;

					const contentData = isRecord(event.content.data)
						? event.content.data
						: {};
					const body = Array.isArray(contentData.body)
						? (contentData.body as PortableTextBlock[])
						: [];

					const rawHeadings = extractHeadings(body);

					// Read existing content for metadata merge
					const id = event.content.id as string;
					const existing = await ctx.content.get(
						event.collection,
						id,
					);
					const existingData = isRecord(existing?.data)
						? existing!.data
						: {};
					const existingMetadata = isRecord(existingData.metadata)
						? (existingData.metadata as Record<string, unknown>)
						: {};

					if (rawHeadings.length < minHeadings) {
						// Below threshold - remove tocgen key if it existed, preserve rest
						if (existingMetadata.tocgen !== undefined) {
							const { tocgen: _, ...rest } = existingMetadata;
							await ctx.content.update!(event.collection, id, {
								metadata: rest,
							});
						}
						return;
					}

					const flatHeadings = deduplicateAnchors(rawHeadings);
					const entries = nestHeadings(flatHeadings, maxDepth);

					await ctx.content.update!(event.collection, id, {
						metadata: {
							...existingMetadata,
							tocgen: {
								entries,
								generatedAt: new Date().toISOString(),
							},
						},
					});

					ctx.log.info("tocgen: updated", {
						id,
						headingCount: entries.length,
					});
				} catch (err) {
					ctx.log.error("tocgen: hook failed", { err });
				}
			},
		},
	},
});
