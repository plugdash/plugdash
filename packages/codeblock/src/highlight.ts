// @plugdash/codeblock - Shiki highlighting, extracted from the Astro component
// so the interesting behaviour (language resolution, truncation, caching) is
// testable without a renderer.
//
// Runs server-side only. The highlighter is built on Shiki's JavaScript regex
// engine rather than the default Oniguruma one, because the WASM engine does
// not load inside a Cloudflare Worker.

import {
	bundledLanguages,
	bundledLanguagesAlias,
	bundledThemes,
	createHighlighter,
	createJavaScriptRegexEngine,
	type BundledLanguage,
	type BundledTheme,
	type Highlighter,
} from "shiki";

export interface CodeblockConfig {
	/** Shiki theme name. Unknown names fall back to the default. */
	theme?: string;
	/** Optional second theme for light mode. Emits Shiki's dual-theme CSS variables. */
	lightTheme?: string;
	/** Languages to load up front. Anything else loads on first use. */
	langs?: string[];
	/** Render line numbers. Consumed by the component, not by highlightCode. */
	lineNumbers?: boolean;
}

export type HighlightOptions = Pick<CodeblockConfig, "theme" | "lightTheme" | "langs">;

export const DEFAULT_THEME: BundledTheme = "github-dark";

/** Loaded when the highlighter is first built. Everything else loads on demand. */
export const DEFAULT_LANGS: BundledLanguage[] = [
	"typescript",
	"javascript",
	"python",
	"go",
	"rust",
	"shell",
	"json",
	"yaml",
	"markdown",
	"html",
	"css",
	"sql",
];

/** Code longer than this is cut off, with a notice appended as the last line. */
export const MAX_LINES = 10_000;

/** Highlighted results kept in memory, oldest evicted first. */
export const CACHE_MAX = 100;

const PLAINTEXT = "plaintext";
type ResolvedLanguage = BundledLanguage | typeof PLAINTEXT;

/** Names a writer might reasonably use for "do not highlight this". */
const PLAINTEXT_ALIASES = new Set(["", "text", "txt", "plain", "plaintext", "none"]);

const cache = new Map<string, string>();

/** Where createPlugin() leaves the site's config for the auto-wired component. */
const CONFIG_KEY = "__plugdash_codeblock_config__";

let highlighterPromise: Promise<Highlighter> | null = null;

function getHighlighter(langs?: string[]): Promise<Highlighter> {
	highlighterPromise ??= createHighlighter({
		themes: [DEFAULT_THEME],
		langs: langs ?? DEFAULT_LANGS,
		engine: createJavaScriptRegexEngine(),
	});
	return highlighterPromise;
}

/**
 * Drops the cached highlighter and highlighted output. Tests only.
 * The old instance is disposed so repeated resets do not leak grammars.
 */
export function resetHighlighter(): void {
	void highlighterPromise?.then((highlighter) => highlighter.dispose());
	highlighterPromise = null;
	cache.clear();
}

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

/** Number of highlighted results currently held. Lets tests see the cache work. */
export function cacheSize(): number {
	return cache.size;
}

export function resolveLanguage(language?: string | null): ResolvedLanguage {
	const key = (language ?? "").trim().toLowerCase();
	if (PLAINTEXT_ALIASES.has(key)) return PLAINTEXT;
	if (key in bundledLanguages || key in bundledLanguagesAlias) {
		return key as BundledLanguage;
	}
	return PLAINTEXT;
}

export function resolveTheme(theme?: string | null): BundledTheme {
	const key = (theme ?? "").trim();
	return key in bundledThemes ? (key as BundledTheme) : DEFAULT_THEME;
}

/**
 * Caps code at MAX_LINES and appends a notice saying how much was dropped.
 * Long files are usually a paste accident, and highlighting them is the
 * slowest thing this package can do.
 */
export function truncate(code: string): string {
	const lines = code.split("\n");
	if (lines.length <= MAX_LINES) return code;
	const dropped = lines.length - MAX_LINES;
	return `${lines.slice(0, MAX_LINES).join("\n")}\n... truncated, ${dropped} more line${dropped === 1 ? "" : "s"} not shown`;
}

function cacheGet(key: string): string | undefined {
	const hit = cache.get(key);
	if (hit === undefined) return undefined;
	// Re-insert so the most recently used entry is last in iteration order.
	cache.delete(key);
	cache.set(key, hit);
	return hit;
}

function cacheSet(key: string, html: string): void {
	cache.set(key, html);
	if (cache.size <= CACHE_MAX) return;
	const oldest = cache.keys().next().value;
	if (oldest !== undefined) cache.delete(oldest);
}

async function loadThemes(highlighter: Highlighter, names: BundledTheme[]): Promise<void> {
	for (const name of names) {
		if (!highlighter.getLoadedThemes().includes(name)) {
			await highlighter.loadTheme(name);
		}
	}
}

export interface ThemeColors {
	bg: string;
	fg: string;
	lightBg?: string;
	lightFg?: string;
}

/**
 * Background and text colours of the configured themes, so the component can
 * paint the header to match the code instead of a fixed dark grey.
 */
export async function themeColors(options: HighlightOptions = {}): Promise<ThemeColors> {
	const theme = resolveTheme(options.theme);
	const lightTheme = options.lightTheme ? resolveTheme(options.lightTheme) : null;
	const highlighter = await getHighlighter(options.langs);
	await loadThemes(highlighter, lightTheme ? [theme, lightTheme] : [theme]);

	const { bg, fg } = highlighter.getTheme(theme);
	if (!lightTheme) return { bg, fg };
	const light = highlighter.getTheme(lightTheme);
	return { bg, fg, lightBg: light.bg, lightFg: light.fg };
}

/**
 * Highlights a code string and returns Shiki's `<pre>` HTML.
 *
 * Unknown or missing languages render as plaintext rather than throwing, so a
 * typo in a post's language field never takes the page down.
 */
export async function highlightCode(
	code: string,
	language?: string | null,
	options: HighlightOptions = {},
): Promise<string> {
	const source = truncate(code ?? "");
	if (source.length === 0) {
		return '<pre class="shiki plugdash-codeblock-empty"><code></code></pre>';
	}

	const lang = resolveLanguage(language);
	const theme = resolveTheme(options.theme);
	const lightTheme = options.lightTheme ? resolveTheme(options.lightTheme) : null;

	const key = `${theme}\u0000${lightTheme ?? ""}\u0000${lang}\u0000${source}`;
	const hit = cacheGet(key);
	if (hit !== undefined) return hit;

	const highlighter = await getHighlighter(options.langs);

	if (!highlighter.getLoadedLanguages().includes(lang)) {
		await highlighter.loadLanguage(lang);
	}
	await loadThemes(highlighter, lightTheme ? [theme, lightTheme] : [theme]);

	const html = lightTheme
		? highlighter.codeToHtml(source, {
				lang,
				themes: { light: lightTheme, dark: theme },
				defaultColor: "dark",
			})
		: highlighter.codeToHtml(source, { lang, theme });

	cacheSet(key, html);
	return html;
}
