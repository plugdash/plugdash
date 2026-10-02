// @plugdash/codeblock - the cache key shared by the save hook and the component.
//
// Both sides must agree on it byte for byte, so it lives in one place and has
// no Shiki dependency: the component imports it on every render, and a page
// whose blocks were highlighted on save should never load Shiki at all.

import pkg from "../package.json" with { type: "json" };
import type { CodeblockConfig } from "./highlight.ts";

/** Where createPlugin() leaves the site's config for the auto-wired component. */
const CONFIG_KEY = "__plugdash_codeblock_config__";

/**
 * Stores the site's config for the auto-wired component. EmDash calls
 * createPlugin(options) in the server runtime but hands the component only the
 * block node, so this is the only way the options reach it. globalThis rather
 * than a module variable because the component imports this file from src/
 * while createPlugin runs from the bundled dist/, so they are separate modules.
 */
export function setSiteConfig(config: CodeblockConfig): void {
	(globalThis as Record<string, unknown>)[CONFIG_KEY] = config;
}

export function getSiteConfig(): CodeblockConfig {
	const config = (globalThis as Record<string, unknown>)[CONFIG_KEY];
	return typeof config === "object" && config !== null ? (config as CodeblockConfig) : {};
}

export interface ResolvedOptions {
	theme?: string;
	lightTheme?: string;
	lineNumbers: boolean;
	langs?: string[];
}

/** Highlight output stored on a `code` node by the content:beforeSave hook. */
export interface StoredHighlight {
	key: string;
	html: string;
	bg: string;
	fg: string;
	lightBg?: string;
	lightFg?: string;
}

/**
 * Fills in the defaults the component applies. With no theme configured at
 * all, blocks get the GitHub dark/light pair; pick a theme and the light one
 * is opt-in.
 */
export function resolveOptions(config: CodeblockConfig = {}): ResolvedOptions {
	return {
		theme: config.theme,
		lightTheme: config.lightTheme ?? (config.theme ? undefined : "github-light"),
		lineNumbers: config.lineNumbers ?? false,
		langs: config.langs,
	};
}

/** FNV-1a, 32-bit, as 8 hex chars. Fast and sync; this is a cache key, not a signature. */
function fnv1a(input: string): string {
	let hash = 0x811c9dc5;
	for (let i = 0; i < input.length; i++) {
		hash ^= input.charCodeAt(i);
		hash = Math.imul(hash, 0x01000193);
	}
	return (hash >>> 0).toString(16).padStart(8, "0");
}

export function highlightKey(
	node: { code?: string; language?: string | null },
	options: ResolvedOptions,
): string {
	return fnv1a(
		[
			node.code ?? "",
			node.language ?? "",
			options.theme ?? "",
			options.lightTheme ?? "",
			String(options.lineNumbers),
			pkg.version,
		].join("\u0000"),
	);
}
