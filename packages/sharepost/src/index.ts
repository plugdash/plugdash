// @plugdash/sharepost - deprecated no-op native plugin.
//
// Share URLs are built at render time by ShareButtons.astro, so nothing needs
// registering. sharepostPlugin() stays so existing astro.config.mjs files keep working.

import { definePlugin } from "emdash";
import type { PluginDescriptor } from "@plugdash/types";
import pkg from "../package.json" with { type: "json" };
import type { Platform } from "./utils.ts";

export type { Platform };

export interface SharepostConfig {
	/** @deprecated Pass `platforms` to <ShareButtons> instead. */
	platforms?: Platform[];
	/** @deprecated Pass `via` to <ShareButtons> instead. */
	via?: string;
	/** @deprecated Pass `hashtags` to <ShareButtons> instead. */
	hashtags?: string[];
}

/** @deprecated No registration needed. Use <ShareButtons> directly. */
export function sharepostPlugin(_config?: SharepostConfig): PluginDescriptor<SharepostConfig> {
	return {
		id: "sharepost",
		version: pkg.version,
		format: "native",
		entrypoint: "@plugdash/sharepost",
		capabilities: [],
	};
}

export function createPlugin() {
	return definePlugin({ id: "sharepost", version: pkg.version, hooks: {} });
}

export default createPlugin;
