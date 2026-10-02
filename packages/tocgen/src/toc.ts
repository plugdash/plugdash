// Pure TOC helpers. No hooks, no storage, no EmDash runtime import.

import { isRecord } from "@plugdash/types";

export interface TocEntry {
	id: string;
	text: string;
	level: 2 | 3 | 4;
	children: TocEntry[];
}

export interface TocOptions {
	/** Deepest heading level to include. Default: 3. */
	maxDepth?: 2 | 3 | 4;
	/** Minimum headings needed before a TOC is returned. Default: 3. */
	minHeadings?: number;
	/** Name of the Portable Text field. Default: content, then body, then first PT array. */
	field?: string;
}

interface RawHeading {
	level: number;
	text: string;
}

interface FlatHeading extends RawHeading {
	id: string;
}

type Block = Record<string, unknown>;

const isBlockArray = (v: unknown): v is Block[] =>
	Array.isArray(v) && v.length > 0 && v.every((b) => isRecord(b) && typeof b._type === "string");

/** Find the Portable Text array on a post: `field`, `data.content`, `data.body`, then the first PT array in `data`. */
export function getBodyBlocks(post: unknown, field?: string): Block[] | null {
	if (!isRecord(post) || !isRecord(post.data)) return null;
	const data = post.data;
	if (field) return isBlockArray(data[field]) ? data[field] : null;
	return [data.content, data.body, ...Object.values(data)].find(isBlockArray) ?? null;
}

export function extractHeadings(body: unknown[]): RawHeading[] {
	const headings: RawHeading[] = [];
	for (const block of body) {
		if (!isRecord(block) || block._type !== "block") continue;
		const m = /^h([234])$/.exec(String(block.style));
		if (!m) continue;
		const text = (Array.isArray(block.children) ? block.children : [])
			.map((c) => (isRecord(c) && c._type === "span" && typeof c.text === "string" ? c.text : ""))
			.join("");
		if (text.trim()) headings.push({ level: Number(m[1]), text });
	}
	return headings;
}

// HeadingAnchors.astro carries a copy of this logic. Keep them in sync (tests check it).
/** Unicode-safe slug: strips accents, keeps letters and digits in any script. Never empty. */
export function toAnchor(text: string): string {
	const slug = text
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[^\p{L}\p{M}\p{N}]+/gu, "-")
		.replace(/^-+|-+$/g, "");
	return slug || "section";
}

export function deduplicateAnchors(headings: RawHeading[]): FlatHeading[] {
	const seen = new Map<string, number>();
	return headings.map((h) => {
		const base = toAnchor(h.text);
		const count = (seen.get(base) ?? 0) + 1;
		seen.set(base, count);
		return { id: count === 1 ? base : `${base}-${count}`, text: h.text, level: h.level };
	});
}

export function nestHeadings(flat: FlatHeading[], maxDepth: number): TocEntry[] {
	const root: TocEntry[] = [];
	let h2: TocEntry | null = null;
	let h3: TocEntry | null = null;
	for (const h of flat) {
		if (h.level > maxDepth) continue;
		const entry: TocEntry = { id: h.id, text: h.text, level: h.level as 2 | 3 | 4, children: [] };
		if (h.level === 2) {
			root.push(entry);
			h2 = entry;
			h3 = null;
		} else if (h.level === 3) {
			(h2?.children ?? root).push(entry);
			h3 = entry;
		} else {
			(h3?.children ?? h2?.children ?? root).push(entry);
		}
	}
	return root;
}

/** Nested TOC for a post (looked up with getBodyBlocks) or a Portable Text array. Empty below minHeadings. */
export function getToc(
	postOrBlocks: unknown,
	{ maxDepth = 3, minHeadings = 3, field }: TocOptions = {},
): TocEntry[] {
	const blocks = Array.isArray(postOrBlocks) ? postOrBlocks : getBodyBlocks(postOrBlocks, field);
	if (!blocks) return [];
	const flat = deduplicateAnchors(extractHeadings(blocks)).filter((h) => h.level <= maxDepth);
	return flat.length < minHeadings ? [] : nestHeadings(flat, maxDepth);
}
