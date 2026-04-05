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

// ── Admin page helpers ──

function parseCollections(input: unknown): string[] | null {
	if (typeof input !== "string") return null;
	const list = input
		.split(",")
		.map((s) => s.trim())
		.filter((s) => s.length > 0);
	return list.length > 0 ? list : null;
}

function parseHashtags(input: unknown): string[] {
	if (typeof input !== "string") return [];
	return input
		.split(",")
		.map((s) => s.trim().replace(/^#/, ""))
		.filter((s) => s.length > 0);
}

function sanitizeVia(input: unknown): string {
	if (typeof input !== "string") return "";
	const stripped = input.trim().replace(/^@/, "");
	// alphanumeric + underscores only
	return /^[a-zA-Z0-9_]*$/.test(stripped) ? stripped : "";
}

export function validateSharepostSettings(values: Record<string, unknown>): {
	ok: boolean;
	error?: string;
	platforms?: Platform[];
	via?: string;
	hashtags?: string[];
	collections?: string[] | null;
} {
	let platforms: Platform[];
	const raw = values.platforms;
	if (Array.isArray(raw)) {
		platforms = raw.filter((p): p is Platform =>
			ALL_PLATFORMS.includes(p as Platform),
		);
	} else if (typeof raw === "string" && raw.length > 0) {
		platforms = raw
			.split(",")
			.map((s) => s.trim())
			.filter((p): p is Platform => ALL_PLATFORMS.includes(p as Platform));
	} else {
		platforms = [];
	}
	if (platforms.length === 0) {
		return { ok: false, error: "At least one share platform must be selected" };
	}

	if (typeof values.via === "string" && values.via.trim().length > 0) {
		const stripped = values.via.trim().replace(/^@/, "");
		if (!/^[a-zA-Z0-9_]*$/.test(stripped)) {
			return {
				ok: false,
				error: "Twitter handle must contain only letters, numbers, and underscores",
			};
		}
	}

	const via = sanitizeVia(values.via);
	const hashtags = parseHashtags(values.hashtags);
	const collections = parseCollections(values.collections);
	return { ok: true, platforms, via, hashtags, collections };
}

async function buildSettingsPage(ctx: PluginContext) {
	const platforms =
		(await ctx.kv.get<Platform[]>("config:platforms")) ?? ALL_PLATFORMS;
	const via = (await ctx.kv.get<string>("config:via")) ?? "";
	const hashtags = (await ctx.kv.get<string[]>("config:hashtags")) ?? [];
	const collections = await ctx.kv.get<string[] | null>("config:collections");

	return {
		blocks: [
			{ type: "header", text: "Share Post Settings" },
			{
				type: "context",
				text: "Configure share buttons. Changes take effect on the next publish.",
			},
			{ type: "divider" },
			{
				type: "form",
				block_id: "sharepost-settings",
				fields: [
					{
						type: "checkbox",
						action_id: "platforms",
						label: "Share platforms",
						options: [
							{ label: "Twitter / X", value: "twitter" },
							{ label: "LinkedIn", value: "linkedin" },
							{ label: "WhatsApp", value: "whatsapp" },
							{ label: "Bluesky", value: "bluesky" },
							{ label: "Email", value: "email" },
						],
						initial_value: platforms,
					},
					{
						type: "text_input",
						action_id: "via",
						label: "Twitter via handle (optional)",
						placeholder: "abhinavs",
						initial_value: via,
						help_text: "Your Twitter handle without the @ sign.",
					},
					{
						type: "text_input",
						action_id: "hashtags",
						label: "Twitter hashtags (comma-separated, optional)",
						placeholder: "emdashcms, plugdash",
						initial_value: hashtags.join(", "),
					},
					{
						type: "text_input",
						action_id: "collections",
						label: "Collections (comma-separated, leave blank for all)",
						placeholder: "blog",
						initial_value: collections && collections.length > 0 ? collections.join(", ") : "",
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
	const result = validateSharepostSettings(values);
	if (!result.ok) {
		const page = await buildSettingsPage(ctx);
		return { ...page, toast: { message: result.error, type: "error" } };
	}
	await ctx.kv.set("config:platforms", result.platforms!);
	await ctx.kv.set("config:via", result.via ?? "");
	await ctx.kv.set("config:hashtags", result.hashtags ?? []);
	await ctx.kv.set("config:collections", result.collections ?? null);
	const page = await buildSettingsPage(ctx);
	return { ...page, toast: { message: "Settings saved", type: "success" } };
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
