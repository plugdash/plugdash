// @plugdash/tocgen - descriptor factory (runs in Vite at build time)

import type { PluginDescriptor } from "@plugdash/types";
import pkg from "../package.json" with { type: "json" };

export interface TocgenConfig {
	/** Minimum headings required to generate a TOC. Default: 3. */
	minHeadings?: number;
	/** Maximum heading depth to include. 2 = h2 only, 3 = h2+h3, 4 = h2+h3+h4. Default: 3. */
	maxDepth?: 2 | 3 | 4;
	/** Limit to specific collections. Default: all collections. */
	collections?: string[];
}

export function tocgenPlugin(config?: TocgenConfig): PluginDescriptor {
	return {
		id: "tocgen",
		version: pkg.version,
		format: "standard",
		entrypoint: "@plugdash/tocgen/sandbox",
		capabilities: ["content:read", "content:write"],
		options: config as Record<string, unknown>,
		adminPages: [{ path: "/settings", label: "Table of Contents", icon: "list" }],
	};
}
