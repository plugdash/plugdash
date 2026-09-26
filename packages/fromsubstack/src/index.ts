// @plugdash/fromsubstack - Native plugin that registers Substack as an import source.
//
// Native rather than sandboxed: registering an import source and streaming a
// multi-megabyte ZIP through the importer both need direct host access.

import { definePlugin, registerSource } from "emdash";
import type { PluginDescriptor } from "@plugdash/types";
import { createSubstackSource, type FromsubstackConfig } from "./source.ts";
import pkg from "../package.json" with { type: "json" };

const ID = "fromsubstack";
const VERSION = pkg.version;

export function fromsubstackPlugin(
	config: FromsubstackConfig = {},
): PluginDescriptor<FromsubstackConfig> {
	return {
		id: ID,
		version: VERSION,
		format: "native",
		entrypoint: "@plugdash/fromsubstack",
		capabilities: ["content:write", "media:write"],
		options: config,
	};
}

export function createPlugin(config: FromsubstackConfig = {}) {
	// The import registry is per-process, so registering here means it happens
	// on every boot that loads the plugin, not just on install.
	registerSource(createSubstackSource(config));

	return definePlugin({
		id: ID,
		version: VERSION,
		hooks: {},
	});
}

export default createPlugin;
export { createSubstackSource, REQUIRED_FIELDS } from "./source.ts";
export type { FromsubstackConfig, SubstackPost } from "./source.ts";
export { parseCsv, parseCsvRows } from "./csv.ts";
