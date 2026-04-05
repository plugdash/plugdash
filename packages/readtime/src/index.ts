// @plugdash/readtime - descriptor factory (runs in Vite at build time)

import type { PluginDescriptor } from "@plugdash/types";

export interface ReadtimeConfig {
	/** Words per minute for reading time calculation. Default: 238. */
	wordsPerMinute?: number;
	/** Limit to specific collections. Default: all collections. */
	collections?: string[];
}

export function readtimePlugin(config?: ReadtimeConfig): PluginDescriptor {
	return {
		id: "readtime",
		version: "0.1.0",
		format: "standard",
		entrypoint: "@plugdash/readtime/sandbox",
		capabilities: ["read:content", "write:content"],
		// Options are documentation-only for standard plugins.
		// At runtime, config is read from ctx.kv (seeded by plugin:install hook).
		options: config as Record<string, unknown> | undefined,
	};
}
