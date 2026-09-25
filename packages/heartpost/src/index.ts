import type { PluginDescriptor } from "@plugdash/types";

export interface HeartpostConfig {
	collections?: string[];
	label?: string;
}

export function heartpostPlugin(_config?: HeartpostConfig): PluginDescriptor {
	return {
		id: "heartpost",
		version: "0.2.1",
		format: "standard",
		entrypoint: "@plugdash/heartpost/sandbox",
		options: {} as Record<string, unknown>,
		capabilities: ["content:read"],
		adminPages: [{ path: "/settings", label: "Heart Post", icon: "heart" }],
	};
}
