// @plugdash/tocgen - the TOC is computed in TableOfContents.astro at render
// time. The plugin descriptor is kept only so old astro.config.mjs files load.

import { definePlugin } from "emdash";
import type { PluginDescriptor } from "@plugdash/types";
import pkg from "../package.json" with { type: "json" };

export {
	getToc,
	getBodyBlocks,
	toAnchor,
	extractHeadings,
	deduplicateAnchors,
	nestHeadings,
} from "./toc.ts";
export type { TocEntry, TocOptions } from "./toc.ts";

/** Ignored. Pass `minHeadings` and `maxDepth` to `<TableOfContents>` instead. */
export interface TocgenConfig {
	minHeadings?: number;
	maxDepth?: 2 | 3 | 4;
	collections?: string[];
}

/** @deprecated Registration is not needed. Import `TableOfContents.astro` and pass `post`. */
export function tocgenPlugin(_config?: TocgenConfig): PluginDescriptor {
	return {
		id: "tocgen",
		version: pkg.version,
		format: "native",
		entrypoint: "@plugdash/tocgen",
		capabilities: [],
	};
}

export function createPlugin() {
	return definePlugin({ id: "tocgen", version: pkg.version, hooks: {} });
}
