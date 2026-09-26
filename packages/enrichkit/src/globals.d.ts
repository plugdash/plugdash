// Build-time config bridge. The descriptor factory writes to this global so
// the sandbox-entry can seed KV on plugin:install. Only populated in trusted
// mode (same process). Sandboxed isolates don't share globals, so there the
// config comes from KV via the admin page.

import type { EnrichkitConfig } from "./index.ts";

declare global {
	// eslint-disable-next-line no-var
	var __plugdash_enrichkit_config__: EnrichkitConfig | undefined;
}

export {};
