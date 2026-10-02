// @plugdash/readtime - reading time is computed in ReadingTime.astro at render
// time. The plugin descriptor is kept only so old astro.config.mjs files load.

import { definePlugin } from "emdash";
import type { PluginDescriptor } from "@plugdash/types";
import pkg from "../package.json" with { type: "json" };

export { getReadingTime, getBodyBlocks } from "./reading-time.ts";
export type { ReadingTime, ReadingTimeOptions } from "./reading-time.ts";

/** Ignored. Pass `wordsPerMinute` to `<ReadingTime>` instead. */
export interface ReadtimeConfig {
	wordsPerMinute?: number;
	collections?: string[];
}

/** @deprecated Registration is not needed. Import `ReadingTime.astro` and pass `post`. */
export function readtimePlugin(_config?: ReadtimeConfig): PluginDescriptor {
	return {
		id: "readtime",
		version: pkg.version,
		format: "native",
		entrypoint: "@plugdash/readtime",
		capabilities: [],
	};
}

export function createPlugin() {
	return definePlugin({ id: "readtime", version: pkg.version, hooks: {} });
}
