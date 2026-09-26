// Ghost JSON export parsing and field mapping.
//
// Ghost writes the whole site out as one JSON file. Every version from 2.x
// through 5.x wraps the tables in `{ db: [{ meta, data }] }`, but the Admin
// API and a few third-party exporters hand back a bare `{ data }` or even
// just `{ posts }`, so all three shapes are accepted.
//
// Everything here is pure: no fetching, no file access, no emdash imports.

import { isRecord } from "@plugdash/types";

/** A row of Ghost's `posts` table. Ghost omits columns it has no value for. */
export interface GhostPost {
	id?: string;
	uuid?: string;
	title?: string | null;
	slug?: string | null;
	/** Rendered body. Null on drafts Ghost never rendered. */
	html?: string | null;
	/** Ghost 5.x editor payload. */
	lexical?: string | null;
	/** Ghost 4.x and older editor payload. */
	mobiledoc?: string | null;
	feature_image?: string | null;
	feature_image_alt?: string | null;
	feature_image_caption?: string | null;
	published_at?: string | null;
	created_at?: string | null;
	updated_at?: string | null;
	status?: string | null;
	excerpt?: string | null;
	custom_excerpt?: string | null;
	meta_title?: string | null;
	meta_description?: string | null;
	visibility?: string | null;
	/** Ghost 5.x: "post" or "page". */
	type?: string | null;
	/** Ghost 4.x and older: pages were posts with `page: true`. */
	page?: boolean | number | null;
}

export interface GhostTag {
	id?: string;
	name?: string | null;
	slug?: string | null;
	/** "public" or "internal". Internal tags are Ghost bookkeeping. */
	visibility?: string | null;
}

export interface GhostUser {
	id?: string;
	name?: string | null;
	slug?: string | null;
	email?: string | null;
}

/** A row of `posts_tags` or `posts_authors`. */
export interface GhostJoinRow {
	post_id?: string;
	tag_id?: string;
	author_id?: string;
	sort_order?: number;
}

export interface GhostSetting {
	key?: string;
	value?: string | null;
}

export interface GhostData {
	posts: GhostPost[];
	tags: GhostTag[];
	users: GhostUser[];
	posts_tags: GhostJoinRow[];
	posts_authors: GhostJoinRow[];
	settings: GhostSetting[];
}

export interface ParsedGhostExport {
	/** `meta.version` from the export, or "unknown" when the export omits it. */
	version: string;
	data: GhostData;
}

/** Ghost stores media paths against this placeholder instead of the site URL. */
export const GHOST_URL_PLACEHOLDER = "__GHOST_URL__";

function rows<T>(source: Record<string, unknown>, table: string): T[] {
	const value = source[table];
	if (!Array.isArray(value)) return [];
	return value.filter(isRecord) as T[];
}

function readVersion(container: Record<string, unknown>): string | null {
	const meta = container["meta"];
	if (isRecord(meta) && typeof meta["version"] === "string") return meta["version"];
	return null;
}

/**
 * Parses a Ghost export into its tables.
 *
 * Throws when the JSON carries no recognisable post data - a wrong file is far
 * more common than a malformed one, and silently importing nothing is worse
 * than saying so.
 */
export function parseGhostExport(raw: unknown): ParsedGhostExport {
	if (!isRecord(raw)) {
		throw new Error("Ghost export must be a JSON object");
	}

	let version = readVersion(raw);
	let source: Record<string, unknown> | null = null;

	const db = raw["db"];
	if (Array.isArray(db)) {
		const first = db.find(isRecord);
		if (first) {
			version = version ?? readVersion(first);
			if (isRecord(first["data"])) source = first["data"];
		}
	} else if (isRecord(raw["data"])) {
		source = raw["data"];
	} else if (Array.isArray(raw["posts"])) {
		source = raw;
	}

	if (!source) {
		throw new Error(
			"Not a Ghost export: expected `db[].data`, `data` or `posts` in the JSON",
		);
	}

	return {
		version: version ?? "unknown",
		data: {
			posts: rows<GhostPost>(source, "posts"),
			tags: rows<GhostTag>(source, "tags"),
			users: rows<GhostUser>(source, "users"),
			posts_tags: rows<GhostJoinRow>(source, "posts_tags"),
			posts_authors: rows<GhostJoinRow>(source, "posts_authors"),
			settings: rows<GhostSetting>(source, "settings"),
		},
	};
}

function lookupById<T extends { id?: string }>(items: T[]): Map<string, T> {
	const map = new Map<string, T>();
	for (const item of items) {
		if (item.id) map.set(item.id, item);
	}
	return map;
}

export function buildTagLookup(tags: GhostTag[]): Map<string, GhostTag> {
	return lookupById(tags);
}

export function buildUserLookup(users: GhostUser[]): Map<string, GhostUser> {
	return lookupById(users);
}

/**
 * Indexes a join table by post id, keeping Ghost's `sort_order` so the primary
 * author and the author-chosen tag order survive the import.
 */
export function buildJoinIndex(
	joins: GhostJoinRow[],
	valueKey: "tag_id" | "author_id",
): Map<string, string[]> {
	const byPost = new Map<string, GhostJoinRow[]>();
	for (const join of joins) {
		const postId = join.post_id;
		if (!postId || !join[valueKey]) continue;
		const existing = byPost.get(postId);
		if (existing) existing.push(join);
		else byPost.set(postId, [join]);
	}

	const index = new Map<string, string[]>();
	for (const [postId, joinRows] of byPost) {
		const sorted = joinRows
			.slice()
			.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
		index.set(
			postId,
			sorted.map((join) => join[valueKey] as string),
		);
	}
	return index;
}

/** Ghost 5.x marks pages with `type`; 4.x and older used a `page` flag. */
export function ghostPostType(post: GhostPost): "post" | "page" {
	if (post.type === "page") return "page";
	if (post.page === true || post.page === 1) return "page";
	return "post";
}

/**
 * Maps a Ghost post status onto EmDash's. "sent" is a newsletter that was
 * mailed but never published on the site, so it lands as private rather than
 * published.
 */
export function mapGhostStatus(
	status: string | null | undefined,
): "publish" | "draft" | "pending" | "private" | "future" {
	switch (status) {
		case "published":
			return "publish";
		case "scheduled":
			return "future";
		case "sent":
			return "private";
		case "draft":
			return "draft";
		default:
			return "draft";
	}
}

const TRAILING_SLASHES = /\/+$/;

/**
 * Expands Ghost's `__GHOST_URL__` placeholder. Without a site URL the result
 * stays site-relative, which the caller treats as "cannot download".
 */
export function resolveGhostUrl(
	url: string | null | undefined,
	siteUrl: string,
): string | undefined {
	if (!url) return undefined;
	if (!url.startsWith(GHOST_URL_PLACEHOLDER)) return url;

	const path = url.slice(GHOST_URL_PLACEHOLDER.length);
	const normalizedPath = path.startsWith("/") ? path : `/${path}`;
	if (!siteUrl) return normalizedPath;
	return `${siteUrl.replace(TRAILING_SLASHES, "")}${normalizedPath}`;
}

export function isAbsoluteUrl(url: string): boolean {
	return url.startsWith("http://") || url.startsWith("https://");
}

export function parseGhostDate(
	value: string | null | undefined,
): Date | undefined {
	if (!value) return undefined;
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? undefined : date;
}

const HTML_ESCAPES: Record<string, string> = {
	"&": "&amp;",
	"<": "&lt;",
	">": "&gt;",
};

function escapeHtml(text: string): string {
	return text.replace(/[&<>]/g, (char) => HTML_ESCAPES[char] ?? char);
}

function collectLexicalText(node: unknown): string {
	if (!isRecord(node)) return "";
	const own = typeof node["text"] === "string" ? node["text"] : "";
	const children = node["children"];
	if (!Array.isArray(children)) return own;
	return own + children.map(collectLexicalText).join("");
}

/**
 * Ghost 5 drafts written in the Lexical editor can ship with `html: null`.
 * There is no public Lexical renderer to call here, so the node tree is
 * flattened to plain-text paragraphs - lossy, but better than an empty post.
 * Returns null when there is nothing to recover.
 */
export function lexicalToHtml(lexical: string): string | null {
	let parsed: unknown;
	try {
		parsed = JSON.parse(lexical);
	} catch {
		return null;
	}
	if (!isRecord(parsed)) return null;

	const root = parsed["root"];
	if (!isRecord(root)) return null;
	const children = root["children"];
	if (!Array.isArray(children)) return null;

	const paragraphs = children
		.map((node) => collectLexicalText(node).trim())
		.filter((text) => text.length > 0)
		.map((text) => `<p>${escapeHtml(text)}</p>`);

	return paragraphs.length > 0 ? paragraphs.join("") : null;
}

const MIME_TYPES: Record<string, string> = {
	avif: "image/avif",
	gif: "image/gif",
	jpeg: "image/jpeg",
	jpg: "image/jpeg",
	png: "image/png",
	svg: "image/svg+xml",
	webp: "image/webp",
};

/** Filename and mime type for an image URL, for the import preview. */
export function describeImageUrl(url: string): {
	filename?: string;
	mimeType?: string;
} {
	const path = url.split(/[?#]/)[0] ?? url;
	const filename = path.split("/").pop();
	if (!filename) return {};
	const extension = filename.split(".").pop()?.toLowerCase();
	return { filename, mimeType: extension ? MIME_TYPES[extension] : undefined };
}
