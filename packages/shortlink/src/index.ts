import type { PluginDescriptor } from "@plugdash/types";

export interface ShortlinkConfig {
	/** Route prefix for short URLs. Default: "/s/" */
	prefix?: string;
	/** Length of auto-generated codes. Default: 4 */
	codeLength?: number;
	/** Create shortlinks automatically on publish. Default: true */
	autoCreate?: boolean;
	/** Custom domain for full short URLs. Default: uses site URL */
	domain?: string;
}

export function shortlinkPlugin(config?: ShortlinkConfig): PluginDescriptor {
	return {
		id: "shortlink",
		version: "0.1.0",
		format: "standard",
		entrypoint: "@plugdash/shortlink/sandbox",
		capabilities: ["read:content", "write:content"],
		options: config as Record<string, unknown>,
		adminPages: [{ path: "/shortlinks", label: "Short Links", icon: "link" }],
	};
}
