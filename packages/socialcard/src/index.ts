// @plugdash/socialcard - descriptor factory (runs in Vite at build time)

import type { PluginDescriptor } from "@plugdash/types";
import pkg from "../package.json" with { type: "json" };

export interface SocialcardConfig {
	/** Built-in card template. Default: "default". */
	template?: "default" | "minimal" | "bold";
	/** Card width in pixels. Default: 1200. */
	width?: number;
	/** Card height in pixels. Default: 630. */
	height?: number;
	/**
	 * CSS font-family stacks used for the card text. These are written
	 * straight into the SVG, so they must be families the renderer can
	 * resolve - a Google Fonts URL will not work here.
	 */
	fonts?: {
		title?: string;
		body?: string;
	};
	/** Background colour. Default: "#0f172a". */
	background?: string;
	/** Foreground (text) colour. Default: "#f8fafc". */
	foreground?: string;
	/** URL of a logo image drawn in the top-left corner. Optional. */
	logo?: string;
}

export function socialcardPlugin(config?: SocialcardConfig): PluginDescriptor {
	// Bridge config into the sandbox-entry via globalThis. Only works in
	// trusted mode (same process). Sandboxed isolates fall back to
	// KV-only (hardcoded defaults on first install).
	if (config) {
		globalThis.__plugdash_socialcard_config__ = config;
	}

	return {
		id: "socialcard",
		version: pkg.version,
		format: "standard",
		entrypoint: "@plugdash/socialcard/sandbox",
		// The spec's "network:storage" is not a real EmDash capability.
		// Media uploads go through ctx.media, gated by media:write.
		capabilities: ["content:read", "content:write", "media:write"],
		// Options are documentation-only for standard plugins.
		// At runtime, config is read from ctx.kv (seeded by plugin:install
		// hook from the globalThis bootstrap).
		options: config as Record<string, unknown> | undefined,
	};
}
