// Build-time config bridge. The descriptor factory writes to this global so
// the sandbox-entry can seed KV on plugin:install. Only populated in trusted
// mode (same process). Sandboxed isolates don't share globals.

import type { AutobuildConfig } from "./index.ts";

declare global {
	// eslint-disable-next-line no-var
	var __plugdash_autobuild_config__: AutobuildConfig | undefined;
}

export {};
