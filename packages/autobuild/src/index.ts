// @plugdash/autobuild - descriptor factory (runs in Vite at build time)

import type { PluginDescriptor } from "@plugdash/types";

export type ContentStatus =
	| "published"
	| "draft"
	| "archived"
	| "scheduled";

export interface AutobuildConfig {
	/** Deploy webhook URL (Cloudflare Pages, Netlify, Vercel). Required. */
	hookUrl: string;
	/** HTTP method. Default: "POST". */
	method?: "POST" | "GET";
	/** Restrict to specific collections. Default: all collections. */
	collections?: string[];
	/** Content statuses that trigger a rebuild. Default: ["published"]. */
	statuses?: ContentStatus[];
	/** Coalesce rapid publishes into one deploy. Default: 5000ms. */
	debounceMs?: number;
	/** Request timeout in ms. Default: 5000. */
	timeout?: number;
	/** Optional JSON body. */
	body?: Record<string, unknown>;
	/** Optional additional headers. */
	headers?: Record<string, string>;
	/**
	 * Override the auto-parsed allowedHosts. If omitted, allowedHosts is
	 * derived from hookUrl's hostname.
	 */
	allowedHosts?: string[];
}

/**
 * Parse the hostname from a hook URL. Returns null for missing or invalid
 * input. Used at build time to compute the `allowedHosts` descriptor field.
 */
export function parseHookHostname(hookUrl: string | undefined): string | null {
	if (typeof hookUrl !== "string" || hookUrl.length === 0) return null;
	try {
		const url = new URL(hookUrl);
		return url.hostname || null;
	} catch {
		return null;
	}
}

export function autobuildPlugin(config?: AutobuildConfig): PluginDescriptor {
	// Bridge config into the sandbox-entry via globalThis. Only works in
	// trusted mode (same process). Sandboxed isolates fall back to KV-only.
	if (config) {
		globalThis.__plugdash_autobuild_config__ = config;
	}

	const explicitHosts = config?.allowedHosts;
	const parsedHost = parseHookHostname(config?.hookUrl);
	const allowedHosts = explicitHosts
		? explicitHosts
		: parsedHost
			? [parsedHost]
			: [];

	return {
		id: "autobuild",
		version: "0.1.0",
		format: "standard",
		entrypoint: "@plugdash/autobuild/sandbox",
		capabilities: ["network:fetch", "read:content"],
		allowedHosts,
		options: config as Record<string, unknown> | undefined,
		adminPages: [{ path: "/settings", label: "Autobuild", icon: "cloud-arrow-up" }],
	};
}

export default autobuildPlugin;
