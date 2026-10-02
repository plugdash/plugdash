// @plugdash/codeblock - Native plugin adding Shiki highlighting to code blocks
//
// Highlighting is slow and only changes when the code does, so a
// content:beforeSave hook highlights each `code` node once and stores the HTML
// on the node itself (`pdHighlight`). The companion component renders that
// HTML without touching Shiki, and falls back to highlighting at render time
// when the stored key does not match (old posts, a theme change not yet saved,
// or component props that differ from the site config).

import { definePlugin } from "emdash";
import { isRecord, type PluginCapability, type PluginDescriptor } from "@plugdash/types";
import pkg from "../package.json" with { type: "json" };

export {
	highlightCode,
	resolveLanguage,
	resolveTheme,
	truncate,
	resetHighlighter,
	cacheSize,
	getSiteConfig,
	themeColors,
	DEFAULT_THEME,
	DEFAULT_LANGS,
	MAX_LINES,
	CACHE_MAX,
	type CodeblockConfig,
	type HighlightOptions,
	type ThemeColors,
} from "./highlight.ts";

export { highlightKey, resolveOptions, type ResolvedOptions, type StoredHighlight } from "./key.ts";

import { highlightCode, setSiteConfig, themeColors, type CodeblockConfig } from "./highlight.ts";
import { highlightKey, resolveOptions, type StoredHighlight } from "./key.ts";

// Read from package.json so a changesets version bump cannot leave it stale.
const VERSION = pkg.version;

// content:beforeSave rewrites content, so EmDash only registers it for a
// plugin holding content:write.
const CAPABILITIES: PluginCapability[] = ["content:write"];

export function codeblockPlugin(config: CodeblockConfig = {}): PluginDescriptor<CodeblockConfig> {
	return {
		id: "codeblock",
		version: VERSION,
		format: "native",
		entrypoint: "@plugdash/codeblock",
		componentsEntry: "@plugdash/codeblock/astro",
		options: config,
		capabilities: CAPABILITIES,
	};
}

/** Stored HTML above this size is dropped; the component highlights it at render. */
export const MAX_STORED_HTML = 100_000;

async function highlightNode(
	node: Record<string, unknown>,
	config: CodeblockConfig,
): Promise<Record<string, unknown>> {
	const options = resolveOptions(config);
	const code = typeof node.code === "string" ? node.code : "";
	const language = typeof node.language === "string" ? node.language : undefined;
	const key = highlightKey({ code, language }, options);
	if (isRecord(node.pdHighlight) && node.pdHighlight.key === key) return node;

	const { pdHighlight: _stale, ...rest } = node;
	if (!code) return rest;
	const html = await highlightCode(code, language, options);
	if (html.length > MAX_STORED_HTML) return rest;
	const pdHighlight: StoredHighlight = { key, html, ...(await themeColors(options)) };
	return { ...rest, pdHighlight };
}

/**
 * Adds or refreshes `pdHighlight` on every `code` node in any array field of
 * the data being saved. Returns undefined when there is nothing to change.
 */
export async function preHighlight(
	data: Record<string, unknown>,
	config: CodeblockConfig = {},
): Promise<Record<string, unknown> | undefined> {
	let out: Record<string, unknown> | undefined;
	for (const [field, value] of Object.entries(data)) {
		if (!Array.isArray(value)) continue;
		if (!value.some((item) => isRecord(item) && item._type === "code")) continue;
		const nodes: unknown[] = [];
		for (const item of value) {
			nodes.push(
				isRecord(item) && item._type === "code" ? await highlightNode(item, config) : item,
			);
		}
		out ??= { ...data };
		out[field] = nodes;
	}
	return out;
}

export function createPlugin(options: CodeblockConfig = {}) {
	setSiteConfig(options);
	return definePlugin({
		id: "codeblock",
		version: VERSION,
		capabilities: CAPABILITIES,
		hooks: {
			"content:beforeSave": {
				// A cold Shiki build plus a long post can pass the 5 s default.
				timeout: 30_000,
				// A timeout or error must never block the save.
				errorPolicy: "continue",
				handler: async (event, ctx) => {
					try {
						return await preHighlight(event.content, options);
					} catch (error) {
						ctx.log.warn("codeblock: pre-highlight failed, saving without it", {
							error: error instanceof Error ? error.message : String(error),
						});
						return undefined;
					}
				},
			},
		},
	});
}

export default createPlugin;
