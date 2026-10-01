// The Substack import source.
//
// EmDash drives imports through the ImportSource contract: `analyze()` reports
// what is in the export so the admin UI can preview it, `fetchContent()`
// streams normalized items, and `fetchMedia()` hands back bytes for any image
// the host decides to pull in. Creating content and rewriting image URLs is the
// host importer's job, not ours - we only describe and yield.
//
// Everything here runs off the uploaded ZIP in memory. No fs, no temp dir.

// fflate and linkedom are loaded lazily (inside analyze/fetchContent) so that
// registering the plugin at boot costs nothing.
import { parseCsv } from "./csv.ts";
import type {
	AttachmentInfo,
	CollectionSchemaStatus,
	FetchOptions,
	ImportAnalysis,
	ImportContext,
	ImportFieldDef,
	ImportSource,
	NormalizedItem,
	SourceInput,
} from "emdash";

export interface FromsubstackConfig {
	/** Collection the posts land in. Default: "posts". */
	targetCollection?: string;
	/** Status for posts Substack marked as published. Default: "draft". */
	status?: "draft" | "published";
	/** Report images so the host imports them. Default: true. */
	importImages?: boolean;
	/** Keep Substack's slugs instead of re-slugifying titles. Default: true. */
	preserveSlugs?: boolean;
	/** What to do with paid posts (only_paid, founding). Default: "draft", even when status is "published". */
	paidPostsAs?: "draft" | "publish" | "skip";
}

/** ImportAnalysis plus the warnings (skipped rows, empty bodies) found while reading the export. */
export type SubstackAnalysis = ImportAnalysis & { warnings: string[] };

type ResolvedConfig = Required<FromsubstackConfig>;

/** Elements Substack adds around a post that are not part of the writing. */
const SUBSTACK_DROP_SELECTORS = [
	".subscription-widget-wrap",
	".subscription-widget",
	".button-wrapper",
	".share-dialog",
	".post-ufi",
	".footnote-anchor",
];

const utf8 = new TextDecoder();
const text = (bytes: Uint8Array): string => utf8.decode(bytes);

function resolveConfig(config: FromsubstackConfig): ResolvedConfig {
	return {
		targetCollection: config.targetCollection ?? "posts",
		status: config.status ?? "draft",
		importImages: config.importImages ?? true,
		preserveSlugs: config.preserveSlugs ?? true,
		paidPostsAs: config.paidPostsAs ?? "draft",
	};
}

/** Fields the target collection needs for a Substack post to fit. */
export const REQUIRED_FIELDS: ImportFieldDef[] = [
	{ slug: "title", label: "Title", type: "string", required: true, searchable: true },
	{ slug: "body", label: "Body", type: "portableText", required: true, searchable: true },
	{ slug: "subtitle", label: "Subtitle", type: "string", required: false },
	{ slug: "published_at", label: "Published at", type: "datetime", required: false },
];

/** Substack post types that are not articles and have no body worth importing. */
const SKIPPED_TYPES = new Set(["podcast", "thread"]);

const MIME_BY_EXTENSION: Record<string, string> = {
	avif: "image/avif",
	gif: "image/gif",
	jpeg: "image/jpeg",
	jpg: "image/jpeg",
	png: "image/png",
	svg: "image/svg+xml",
	webp: "image/webp",
};

// ── ZIP reading ──

type ZipEntries = Record<string, Uint8Array>;

// Unzipping a newsletter archive is not cheap and fetchMedia() is called once
// per image, so hold on to the entries for as long as the caller holds the File.
const zipCache = new WeakMap<File, ZipEntries>();

async function readZip(input: SourceInput): Promise<ZipEntries> {
	if (input.type !== "file") {
		throw new Error(
			"The Substack importer needs an export ZIP file. Upload the archive you downloaded from Substack under Settings > Exports.",
		);
	}
	const cached = zipCache.get(input.file);
	if (cached) return cached;

	let entries: ZipEntries;
	try {
		const { unzipSync } = await import("fflate");
		entries = unzipSync(new Uint8Array(await input.file.arrayBuffer()));
	} catch {
		throw new Error(
			"Could not read the Substack export: the file is not a valid ZIP archive.",
		);
	}
	zipCache.set(input.file, entries);
	return entries;
}

function basename(path: string): string {
	return path.slice(path.lastIndexOf("/") + 1);
}

// ── Post extraction ──

export interface SubstackPost {
	id: string;
	title: string;
	subtitle: string;
	slug: string;
	url: string;
	type: string;
	audience: string;
	isPublished: boolean;
	date: Date;
	html: string;
}

export interface SubstackExport {
	siteTitle: string;
	siteUrl: string;
	posts: SubstackPost[];
	warnings: string[];
}

/** Reads the first non-empty value among a set of candidate column names. */
function pick(row: Record<string, string>, ...names: string[]): string {
	for (const name of names) {
		const value = row[name];
		if (value !== undefined && value.trim() !== "") return value.trim();
	}
	return "";
}

function slugify(value: string): string {
	return value
		.normalize("NFKD")
		.replace(/[̀-ͯ]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 96);
}

/** Pulls the slug out of a Substack post URL (".../p/my-post"). */
function slugFromUrl(url: string): string {
	const withoutQuery = url.split(/[?#]/)[0] ?? "";
	const last = withoutQuery.replace(/\/+$/, "").split("/").pop() ?? "";
	return last.replace(/\.html?$/i, "");
}

/** Strips the numeric post-id prefix Substack puts on exported HTML files. */
function slugFromFilename(path: string): string {
	const name = basename(path).replace(/\.html?$/i, "");
	return name.replace(/^\d+\./, "");
}

function indexHtmlEntries(entries: ZipEntries): {
	byFilename: Map<string, string>;
	byId: Map<string, string>;
} {
	const byFilename = new Map<string, string>();
	const byId = new Map<string, string>();
	for (const path of Object.keys(entries)) {
		if (!/\.html?$/i.test(path)) continue;
		const name = basename(path);
		byFilename.set(name.toLowerCase(), path);
		const dot = name.indexOf(".");
		if (dot > 0) byId.set(name.slice(0, dot), path);
	}
	return { byFilename, byId };
}

function findPostsCsv(entries: ZipEntries): string {
	for (const path of Object.keys(entries)) {
		if (basename(path).toLowerCase() === "posts.csv") return path;
	}
	throw new Error(
		"Could not find posts.csv in the export. Make sure you uploaded the ZIP straight from Substack without unpacking it.",
	);
}

function parseDate(value: string): Date {
	const parsed = new Date(value);
	return Number.isNaN(parsed.getTime()) ? new Date(0) : parsed;
}

/**
 * Reads posts.csv and pairs every row with its HTML body. Rows that cannot be
 * paired, or that are podcast/thread entries, are dropped with a warning.
 */
async function readExport(
	input: SourceInput,
	config: ResolvedConfig,
): Promise<SubstackExport> {
	const warnings: string[] = [];
	const warn = (message: string) => warnings.push(message);
	const entries = await readZip(input);
	const csvPath = findPostsCsv(entries);
	const rows = parseCsv(text(entries[csvPath]!));
	const html = indexHtmlEntries(entries);

	const posts: SubstackPost[] = [];
	const seenSlugs = new Set<string>();
	let siteUrl = "";

	for (const row of rows) {
		const id = pick(row, "post_id", "id");
		const title = pick(row, "title") || "Untitled";
		const type = (pick(row, "type") || "post").toLowerCase();

		if (SKIPPED_TYPES.has(type)) {
			warn(`Skipped "${title}": Substack type "${type}" has no article body.`);
			continue;
		}

		const url = pick(row, "url", "post_url", "canonical_url");
		if (url && !siteUrl) {
			try {
				siteUrl = new URL(url).origin;
			} catch {
				// A malformed url column is not worth failing the import over.
			}
		}

		// Real exports: post_id is "140001.hello-world" and the file is posts/<post_id>.html.
		// Older/hand-made exports: numeric id plus a url column.
		const htmlPath =
			(id ? html.byFilename.get(`${id}.html`.toLowerCase()) : undefined) ??
			(id ? html.byId.get(id) : undefined) ??
			(id ? html.byId.get(id.split(".")[0]!) : undefined) ??
			(url ? html.byFilename.get(`${slugFromUrl(url)}.html`) : undefined);
		if (!htmlPath) {
			warn(`Skipped "${title}": no HTML file for it in the export.`);
			continue;
		}

		const exportedSlug =
			(url ? slugFromUrl(url) : "") ||
			(id.includes(".") ? id.slice(id.indexOf(".") + 1) : "") ||
			slugFromFilename(htmlPath) ||
			slugify(title);
		const slug = config.preserveSlugs ? exportedSlug : slugify(title) || exportedSlug;

		if (seenSlugs.has(slug)) {
			warn(`Skipped "${title}": slug "${slug}" appears more than once in the export.`);
			continue;
		}
		seenSlugs.add(slug);

		const body = text(entries[htmlPath]!);
		if (body.trim() === "") {
			warn(`"${title}" has an empty body - importing it as an empty post.`);
		}

		posts.push({
			id: id || slug,
			title,
			subtitle: pick(row, "subtitle"),
			slug,
			url,
			type,
			audience: (pick(row, "audience") || "everyone").toLowerCase(),
			isPublished: pick(row, "is_published").toLowerCase() !== "false",
			date: parseDate(pick(row, "post_date", "date", "published_at")),
			html: body,
		});
	}

	return {
		warnings,
		siteTitle: siteUrl ? new URL(siteUrl).hostname : "Substack export",
		siteUrl,
		posts,
	};
}

// ── Normalization ──

/** A converted post plus the image URLs its body references. */
interface ConvertedPost {
	item: NormalizedItem;
	imageUrls: string[];
}

async function convert(post: SubstackPost, config: ResolvedConfig): Promise<ConvertedPost> {
	const { htmlToPortableText } = await import("@plugdash/html-to-portable-text");
	const blocks = htmlToPortableText(post.html, { dropSelectors: SUBSTACK_DROP_SELECTORS });
	const imageUrls: string[] = [];
	for (const block of blocks) {
		if (block._type === "image" && block.asset.url) imageUrls.push(block.asset.url);
	}

	const isPaid = isPaidAudience(post.audience);
	const wanted = isPaid ? config.paidPostsAs : config.status === "published" ? "publish" : "draft";
	const status = !post.isPublished || wanted === "skip" ? "draft" : wanted;

	return {
		item: {
			sourceId: post.id,
			postType: "post",
			status,
			slug: post.slug,
			title: post.title,
			// Our converter emits EmDash's Portable Text block shapes. NormalizedItem
			// types its content with the gutenberg importer's copy of those same
			// interfaces, which the compiler treats as a separate type.
			content: blocks as unknown as NormalizedItem["content"],
			excerpt: post.subtitle || undefined,
			date: post.date,
			meta: {
				substackId: post.id,
				substackUrl: post.url || undefined,
				substackAudience: post.audience,
				substackPaid: isPaid,
				substackSubtitle: post.subtitle || undefined,
			},
			featuredImage: imageUrls[0],
		},
		imageUrls: config.importImages ? imageUrls : [],
	};
}

function isPaidAudience(audience: string): boolean {
	return audience !== "everyone" && audience !== "";
}

function isSkippedPaid(post: SubstackPost, config: ResolvedConfig): boolean {
	return config.paidPostsAs === "skip" && isPaidAudience(post.audience);
}

// ── Schema check ──

async function checkSchema(
	collection: string,
	context: ImportContext,
): Promise<CollectionSchemaStatus> {
	const existing = await context.getExistingCollections?.();
	const target = existing?.get(collection);

	if (!target) {
		return {
			exists: false,
			fieldStatus: Object.fromEntries(
				REQUIRED_FIELDS.map((f) => [f.slug, { status: "missing" as const, requiredType: f.type }]),
			),
			canImport: true,
			reason: `Collection "${collection}" does not exist yet and will be created.`,
		};
	}

	const fieldStatus: CollectionSchemaStatus["fieldStatus"] = {};
	const blockers: string[] = [];

	for (const field of REQUIRED_FIELDS) {
		const found = target.fields.get(field.slug);
		if (!found) {
			fieldStatus[field.slug] = { status: "missing", requiredType: field.type };
			if (field.required) blockers.push(`"${field.slug}" is missing`);
			continue;
		}
		if (found.type !== field.type) {
			fieldStatus[field.slug] = {
				status: "type_mismatch",
				existingType: found.type,
				requiredType: field.type,
			};
			blockers.push(`"${field.slug}" is ${found.type}, needs ${field.type}`);
			continue;
		}
		fieldStatus[field.slug] = { status: "compatible", existingType: found.type, requiredType: field.type };
	}

	return {
		exists: true,
		fieldStatus,
		canImport: blockers.length === 0,
		reason:
			blockers.length > 0
				? `Collection "${collection}" cannot take these posts: ${blockers.join(", ")}.`
				: undefined,
	};
}

// ── Media ──

function mimeFor(path: string): string {
	const extension = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
	return MIME_BY_EXTENSION[extension] ?? "application/octet-stream";
}

async function fetchMedia(url: string, input: SourceInput): Promise<Blob> {
	if (/^https?:\/\//i.test(url)) {
		const response = await fetch(url);
		if (!response.ok) {
			throw new Error(`Could not download ${url}: ${response.status} ${response.statusText}`);
		}
		return response.blob();
	}

	// Anything else is a path into the export's attachments folder.
	const entries = await readZip(input);
	const wanted = basename(url).toLowerCase();
	const match =
		entries[url] ??
		entries[Object.keys(entries).find((p) => basename(p).toLowerCase() === wanted) ?? ""];
	if (!match) throw new Error(`Could not find "${url}" in the Substack export.`);
	return new Blob([match as BlobPart], { type: mimeFor(url) });
}

// ── Source ──

/** Builds the Substack ImportSource for the given configuration. */
export function createSubstackSource(config: FromsubstackConfig = {}): ImportSource {
	const resolved = resolveConfig(config);

	return {
		id: "substack",
		name: "Substack",
		description: "Import posts, metadata and images from a Substack export ZIP.",
		icon: "upload",
		requiresFile: true,

		async analyze(
			input: SourceInput,
			context: ImportContext,
		): Promise<SubstackAnalysis> {
			const exported = await readExport(input, resolved);
			const posts = exported.posts.filter((post) => !isSkippedPaid(post, resolved));
			const converted = await Promise.all(posts.map((post) => convert(post, resolved)));

			const attachments = new Map<string, AttachmentInfo>();
			for (const { imageUrls } of converted) {
				for (const url of imageUrls) {
					if (attachments.has(url)) continue;
					attachments.set(url, {
						url,
						filename: basename(url.split(/[?#]/)[0] ?? url),
						mimeType: mimeFor(url.split(/[?#]/)[0] ?? url),
					});
				}
			}

			return {
				sourceId: "substack",
				warnings: exported.warnings,
				site: { title: exported.siteTitle, url: exported.siteUrl },
				postTypes: [
					{
						name: "post",
						count: converted.length,
						suggestedCollection: resolved.targetCollection,
						requiredFields: REQUIRED_FIELDS,
						schemaStatus: await checkSchema(resolved.targetCollection, context),
					},
				],
				attachments: { count: attachments.size, items: [...attachments.values()] },
				categories: 0,
				tags: 0,
				authors: [{ postCount: converted.length }],
			};
		},

		async *fetchContent(input: SourceInput, options: FetchOptions): AsyncGenerator<NormalizedItem> {
			if (options.postTypes.length > 0 && !options.postTypes.includes("post")) return;

			const exported = await readExport(input, resolved);
			// fetchContent has no return channel for warnings, so log them here.
			for (const message of exported.warnings) console.warn(`[fromsubstack] ${message}`);
			let yielded = 0;

			for (const post of exported.posts) {
				if (isSkippedPaid(post, resolved)) continue;
				if (options.limit !== undefined && yielded >= options.limit) return;
				if (!post.isPublished && options.includeDrafts !== true) continue;
				try {
					yield (await convert(post, resolved)).item;
					yielded++;
				} catch (error) {
					// One unconvertible post should not sink the whole import.
					console.warn(
						`[fromsubstack] Skipped "${post.title}": ${error instanceof Error ? error.message : String(error)}`,
					);
				}
			}
		},

		fetchMedia,
	};
}
