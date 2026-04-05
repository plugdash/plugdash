// @plugdash/sharepost - descriptor factory (runs in Vite at build time)

import type { PluginDescriptor } from "@plugdash/types";

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
		version: "0.1.0",
		format: "standard",
		entrypoint: "@plugdash/sharepost/sandbox",
		capabilities: ["read:content", "write:content"],
		// Options are documentation-only for standard plugins.
		// At runtime, config is read from ctx.kv (seeded by plugin:install hook).
		options: config as Record<string, unknown>,
		adminPages: [{ path: "/settings", label: "Share Post", icon: "share" }],
	};
}
