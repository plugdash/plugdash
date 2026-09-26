import type { PluginDescriptor } from "@plugdash/types";
import pkg from "../package.json" with { type: "json" };

export interface HeartpostConfig {
	collections?: string[];
	label?: string;
}

export function heartpostPlugin(_config?: HeartpostConfig): PluginDescriptor {
	return {
		id: "heartpost",
		version: pkg.version,
		format: "standard",
		entrypoint: "@plugdash/heartpost/sandbox",
		options: {} as Record<string, unknown>,
		capabilities: ["content:read"],
		adminPages: [{ path: "/settings", label: "Heart Post", icon: "heart" }],
	};
}
