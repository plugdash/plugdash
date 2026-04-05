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

// ── Admin page helpers ──

function parseCollections(input: unknown): string[] | null {
	if (typeof input !== "string") return null;
	const list = input
		.split(",")
		.map((s) => s.trim())
		.filter((s) => s.length > 0);
	return list.length > 0 ? list : null;
}

function collectionsToString(value: string[] | null | undefined): string {
	if (!value || value.length === 0) return "";
	return value.join(", ");
}

export function validateTocgenSettings(values: Record<string, unknown>): {
	ok: boolean;
	error?: string;
	minHeadings?: number;
	maxDepth?: 2 | 3 | 4;
	collections?: string[] | null;
} {
	const minRaw = values.minHeadings;
	const minH = typeof minRaw === "number" ? minRaw : Number(minRaw);
	if (!Number.isFinite(minH) || !Number.isInteger(minH) || minH < 1 || minH > 10) {
		return { ok: false, error: "Minimum headings must be an integer between 1 and 10" };
	}
	const depthRaw = String(values.maxDepth ?? "");
	if (depthRaw !== "2" && depthRaw !== "3" && depthRaw !== "4") {
		return { ok: false, error: "Maximum depth must be 2, 3, or 4" };
	}
	const maxDepth = parseInt(depthRaw, 10) as 2 | 3 | 4;
	const collections = parseCollections(values.collections);
	return { ok: true, minHeadings: minH, maxDepth, collections };
}

async function buildSettingsPage(ctx: PluginContext) {
	const minHeadings = (await ctx.kv.get<number>("config:minHeadings")) ?? 3;
	const maxDepth = (await ctx.kv.get<number>("config:maxDepth")) ?? 3;
	const collections = await ctx.kv.get<string[] | null>("config:collections");

	return {
		blocks: [
			{ type: "header", text: "Table of Contents Settings" },
			{
				type: "context",
				text: "Configure TOC generation. Changes take effect on the next publish.",
			},
			{ type: "divider" },
			{
				type: "form",
				block_id: "tocgen-settings",
				fields: [
					{
						type: "number_input",
						action_id: "minHeadings",
						label: "Minimum headings to show TOC",
						placeholder: "3",
						min: 1,
						max: 10,
						initial_value: minHeadings,
						help_text:
							"Posts with fewer headings than this will not show a TOC.",
					},
					{
						type: "select",
						action_id: "maxDepth",
						label: "Maximum heading depth",
						options: [
							{ label: "h2 only", value: "2" },
							{ label: "h2 and h3 (default)", value: "3" },
							{ label: "h2, h3, and h4", value: "4" },
						],
						initial_value: String(maxDepth),
					},
					{
						type: "text_input",
						action_id: "collections",
						label: "Collections (comma-separated, leave blank for all)",
						placeholder: "blog, docs",
						initial_value: collectionsToString(collections ?? null),
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
	const result = validateTocgenSettings(values);
	if (!result.ok) {
		const page = await buildSettingsPage(ctx);
		return { ...page, toast: { message: result.error, type: "error" } };
	}
	await ctx.kv.set("config:minHeadings", result.minHeadings!);
	await ctx.kv.set("config:maxDepth", result.maxDepth!);
	await ctx.kv.set("config:collections", result.collections ?? null);
	const page = await buildSettingsPage(ctx);
	return { ...page, toast: { message: "Settings saved", type: "success" } };
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
