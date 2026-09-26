// @plugdash/sharepost - descriptor factory (runs in Vite at build time)

import type { PluginDescriptor } from "@plugdash/types";
import pkg from "../package.json" with { type: "json" };

export type Platform = "twitter" | "linkedin" | "whatsapp" | "bluesky" | "email";

export interface SharepostConfig {
	/** Platforms to generate share URLs for. Default: all five. */
	platforms?: Platform[];
	/** Twitter @handle without the @, e.g. "abhinavs". */
	via?: string;
	/** Twitter hashtags without #. */
	hashtags?: string[];
}

export function sharepostPlugin(config?: SharepostConfig): PluginDescriptor {
	return {
		id: "sharepost",
		version: pkg.version,
		format: "standard",
		entrypoint: "@plugdash/sharepost/sandbox",
		capabilities: ["content:read", "content:write"],
		// Options are documentation-only for standard plugins.
		// At runtime, config is read from ctx.kv (seeded by plugin:install hook).
		options: config as Record<string, unknown>,
		adminPages: [{ path: "/settings", label: "Share Post", icon: "share" }],
	};
}
