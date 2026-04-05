import type { PluginDescriptor } from "@plugdash/types";

export interface HeartpostConfig {
	collections?: string[];
	label?: string;
}

export function heartpostPlugin(_config?: HeartpostConfig): PluginDescriptor {
	return {
		id: "heartpost",
		version: "0.1.0",
		format: "standard",
		entrypoint: "@plugdash/heartpost/sandbox",
		options: {} as Record<string, unknown>,
		capabilities: ["read:content", "write:content"],
		adminPages: [{ path: "/settings", label: "Heart Post", icon: "heart" }],
	};
}
