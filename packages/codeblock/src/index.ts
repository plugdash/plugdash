// @plugdash/codeblock - Native plugin adding Shiki highlighting to code blocks
//
// Unlike most plugins this one has no lifecycle hooks. EmDash already stores
// code blocks; codeblock only changes how they render, so the work happens at
// render time through the companion Astro component or a direct call to
// highlightCode from a theme.

import { definePlugin } from "emdash";
import type { PluginDescriptor } from "@plugdash/types";
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

import { setSiteConfig, type CodeblockConfig } from "./highlight.ts";

// Read from package.json so a changesets version bump cannot leave it stale.
const VERSION = pkg.version;

export function codeblockPlugin(
	config: CodeblockConfig = {},
): PluginDescriptor<CodeblockConfig> {
	return {
		id: "codeblock",
		version: VERSION,
		format: "native",
		entrypoint: "@plugdash/codeblock",
		componentsEntry: "@plugdash/codeblock/astro",
		options: config,
		capabilities: ["content:read"],
	};
}

export function createPlugin(options: CodeblockConfig = {}) {
	setSiteConfig(options);
	return definePlugin({
		id: "codeblock",
		version: VERSION,
		hooks: {},
	});
}

export default createPlugin;
