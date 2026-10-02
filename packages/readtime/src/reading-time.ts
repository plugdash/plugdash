// Pure reading-time helpers. No hooks, no storage, no EmDash runtime import.

import { isRecord } from "@plugdash/types";

export interface ReadingTimeOptions {
	/** Words per minute for space-separated scripts. Default: 238. */
	wordsPerMinute?: number;
	/** Characters per minute for Han, Hangul, Hiragana and Katakana. Default: 500. */
	cjkCharsPerMinute?: number;
	/** Name of the Portable Text field. Default: content, then body, then first PT array. */
	field?: string;
}

export interface ReadingTime {
	wordCount: number;
	minutes: number;
}

type Block = Record<string, unknown>;

const CJK = /\p{Script=Han}|\p{Script=Hangul}|\p{Script=Hiragana}|\p{Script=Katakana}/gu;

const isBlockArray = (v: unknown): v is Block[] =>
	Array.isArray(v) && v.length > 0 && v.every((b) => isRecord(b) && typeof b._type === "string");

/** Find the Portable Text array on a post: `field`, `data.content`, `data.body`, then the first PT array in `data`. */
export function getBodyBlocks(post: unknown, field?: string): Block[] | null {
	if (!isRecord(post) || !isRecord(post.data)) return null;
	const data = post.data;
	if (field) return isBlockArray(data[field]) ? data[field] : null;
	return [data.content, data.body, ...Object.values(data)].find(isBlockArray) ?? null;
}

function blockText(block: Block): string {
	if (block._type === "block" && Array.isArray(block.children)) {
		return block.children
			.map((c) => (isRecord(c) && c._type === "span" && typeof c.text === "string" ? c.text : ""))
			.join("");
	}
	if (block._type === "callout") {
		return [block.title, block.body].filter((s) => typeof s === "string").join(" ");
	}
	return "";
}

/** Reading time for a post (lookup via getBodyBlocks) or a Portable Text array. */
export function getReadingTime(
	postOrBlocks: unknown,
	{ wordsPerMinute = 238, cjkCharsPerMinute = 500, field }: ReadingTimeOptions = {},
): ReadingTime {
	const blocks = Array.isArray(postOrBlocks) ? postOrBlocks : getBodyBlocks(postOrBlocks, field);
	const text = (blocks ?? []).map((b) => (isRecord(b) ? blockText(b) : "")).join(" ");
	const cjk = text.match(CJK)?.length ?? 0;
	const words = text.replace(CJK, " ").split(/\s+/).filter(Boolean).length;
	const minutes = Math.max(1, Math.ceil(words / wordsPerMinute + cjk / cjkCharsPerMinute));
	return { wordCount: words + cjk, minutes };
}
