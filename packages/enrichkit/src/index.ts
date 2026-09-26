import type { PluginDescriptor } from "@plugdash/types";
import { PROVIDER_HOSTS, type EnrichkitProvider, type EnrichmentFlags } from "./enrich-logic.ts";
import pkg from "../package.json" with { type: "json" };

export interface EnrichkitConfig {
	/** Which LLM API to call. */
	provider: EnrichkitProvider;
	/** API key for the chosen provider. Read this from an env var, never hard-code it. */
	apiKey: string;
	/** Model id. Defaults to claude-haiku-4-5 (anthropic) or gpt-4o-mini (openai). */
	model?: string;
	/** Which enrichments to generate. Omitted flags fall back to their defaults. */
	enrichments?: Partial<EnrichmentFlags>;
}

/**
 * Only the configured provider's host is allowed out. With no build-time
 * config the provider is picked later in the admin UI, so both hosts are
 * allowed - still narrower than blanket network access.
 */
export function providerHosts(provider: EnrichkitProvider | undefined): string[] {
	if (provider === "anthropic" || provider === "openai") {
		return [PROVIDER_HOSTS[provider]];
	}
	return [PROVIDER_HOSTS.anthropic, PROVIDER_HOSTS.openai];
}

export function enrichkitPlugin(config?: EnrichkitConfig): PluginDescriptor {
	if (config) {
		globalThis.__plugdash_enrichkit_config__ = config;
	}
	return {
		id: "enrichkit",
		version: pkg.version,
		format: "standard",
		entrypoint: "@plugdash/enrichkit/sandbox",
		capabilities: ["content:read", "content:write", "network:request"],
		allowedHosts: providerHosts(config?.provider),
		options: config as Record<string, unknown> | undefined,
		adminPages: [{ path: "/settings", label: "Enrichkit", icon: "sparkles" }],
	};
}

export default enrichkitPlugin;

export type { EnrichkitProvider, EnrichmentFlags };
