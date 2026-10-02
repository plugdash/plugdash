// Runs a Ghost or Substack export through its @plugdash import source and
// writes the result into an EmDash site over the REST API.
//
// The sources are created directly (createGhostSource / createSubstackSource)
// rather than looked up in emdash's source registry: the registry lives in
// whichever copy of the `emdash` module registered it, and a different copy
// sees an empty registry.

import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { ApiError, createApi, type Api, type Collection, type MediaItem } from "./api.ts";

export type SourceName = "ghost" | "substack";

export interface ImportOptions {
	source: SourceName;
	/** Path to the export file (Ghost .json, Substack .zip). */
	file: string;
	/** EmDash site URL. */
	url: string;
	token?: string;
	cookie?: string;
	/** Old Ghost site, used to download `__GHOST_URL__/...` images. */
	siteUrl?: string;
	/** Collection that receives posts. Default "posts". */
	collection?: string;
	/** Portable Text field that receives the body. Default "content". */
	field?: string;
	dryRun?: boolean;
	/** Publish entries that were published at the source. Default: import as drafts. */
	publish?: boolean;
}

export interface ImportSummary {
	created: string[];
	skipped: string[];
	failed: { slug: string; reason: string }[];
	warnings: string[];
}

export interface ImportDeps {
	fetch?: typeof fetch;
	log?: (line: string) => void;
}

// Just the parts of emdash's ImportSource / NormalizedItem the CLI touches, so
// it works against any emdash version the sources were built with.
interface Block {
	_type: string;
	_key?: string;
	asset?: { _ref?: string; url?: string };
	alt?: string;
	[key: string]: unknown;
}

interface Item {
	postType: string;
	status: string;
	slug: string;
	title: string;
	content: unknown[];
	excerpt?: string;
	date: Date;
	categories?: string[];
	tags?: string[];
	meta?: Record<string, unknown>;
	featuredImage?: string;
}

interface PostTypeAnalysis {
	name: string;
	count: number;
	suggestedCollection: string;
}

interface Analysis {
	postTypes: PostTypeAnalysis[];
	attachments: { count: number };
	tags: number;
	categories: number;
	warnings?: string[];
}

type Input = { type: "file"; file: File };

interface Source {
	analyze(input: Input, context: unknown): Promise<Analysis>;
	fetchContent(
		input: Input,
		options: { postTypes: string[]; includeDrafts?: boolean },
	): AsyncIterable<Item>;
	fetchMedia?(url: string, input: Input): Promise<Blob>;
}

const GHOST_URL = "__GHOST_URL__";

type Seo = { title?: string; description?: string };

export class ImportError extends Error {}

export async function runImport(
	options: ImportOptions,
	deps: ImportDeps = {},
): Promise<ImportSummary> {
	const log = deps.log ?? console.log;
	const doFetch = deps.fetch ?? fetch;
	const collection = options.collection ?? "posts";
	const field = options.field ?? "content";
	const summary: ImportSummary = { created: [], skipped: [], failed: [], warnings: [] };
	const warn = (message: string) => {
		summary.warnings.push(message);
		log(`  warning: ${message}`);
	};

	const api = createApi({
		url: options.url,
		token: options.token,
		cookie: options.cookie,
		fetch: doFetch,
	});

	const bytes = await readFile(options.file);
	const input: Input = { type: "file", file: new File([bytes], basename(options.file)) };
	const { source, tagLabels, seo: extraSeo } = await loadSource(options, collection, bytes, warn);

	// Schema lookups are cached; the same collection is asked about repeatedly.
	const schemas = new Map<string, Promise<Collection | null>>();
	const schemaFor = (slug: string) => {
		let found = schemas.get(slug);
		if (!found) {
			found = api.collection(slug);
			schemas.set(slug, found);
		}
		return found;
	};

	// ── 1. analyze ──
	const analysis = await source.analyze(input, {
		getExistingCollections: async () => {
			const map = new Map<string, { slug: string; fields: Map<string, { type: string }> }>();
			for (const slug of new Set([collection, "pages"])) {
				const schema = await schemaFor(slug);
				if (schema) map.set(slug, { slug, fields: fieldMap(schema) });
			}
			return map;
		},
	});
	for (const message of analysis.warnings ?? []) warn(message);

	log(`${options.source} export: ${options.file}`);
	for (const type of analysis.postTypes) {
		log(`  ${type.count} ${type.name}${type.count === 1 ? "" : "s"}`);
	}
	log(`  ${analysis.attachments.count} images, ${analysis.tags} tags`);

	// ── 2. schema check ──
	const targets = new Map<string, { slug: string; fields: Map<string, string> }>();
	for (const type of analysis.postTypes) {
		const target = type.name === "post" ? collection : type.suggestedCollection;
		const schema = await schemaFor(target);
		const fields = schema ? fieldMap(schema) : new Map<string, { type: string }>();
		const missing = ["title", field].filter((slug) => !fields.has(slug));

		if (!schema || missing.length > 0) {
			const why = !schema
				? `collection "${target}" does not exist`
				: `collection "${target}" has no ${missing.map((m) => `"${m}"`).join(" or ")} field`;
			if (type.name === "post") {
				throw new ImportError(
					`Cannot import posts: ${why}. Pick another collection with --collection, or the body field with --field.`,
				);
			}
			log(`  skipping ${type.count} ${type.name}(s): ${why}`);
			continue;
		}
		targets.set(type.name, {
			slug: target,
			fields: new Map([...fields].map(([k, v]) => [k, v.type])),
		});
	}

	log("");
	for (const [name, target] of targets) {
		const has = (slug: string) => target.fields.has(slug);
		log(`${name} -> ${target.slug}`);
		log(`  title -> title`);
		log(`  body -> ${field}`);
		if (has("excerpt")) log(`  excerpt -> excerpt`);
		if (target.fields.get("featured_image") === "image") log(`  feature image -> featured_image`);
		log(`  tags -> tag taxonomy, SEO title/description -> seo`);
	}

	if (options.dryRun) {
		log("\nDry run: nothing was written.");
		return summary;
	}

	// ── 3. import ──
	const taxonomies = await loadTaxonomies(api, warn);
	const uploads = new Map<string, Promise<MediaItem | null>>();
	const upload = (rawUrl: string, alt?: string) => {
		const url = resolveUrl(rawUrl, options.siteUrl);
		let pending = uploads.get(url);
		if (!pending) {
			pending = uploadImage(url, alt).catch((error: unknown) => {
				warn(`image ${url} not imported: ${errorMessage(error)}`);
				return null;
			});
			uploads.set(url, pending);
		}
		return pending;
	};

	async function uploadImage(url: string, alt?: string): Promise<MediaItem> {
		const absolute = /^https?:\/\//.test(url);
		if (url.startsWith(GHOST_URL) || (!absolute && !source.fetchMedia)) {
			throw new Error("site-relative URL, pass --site-url with the old site's address");
		}
		let blob: Blob;
		if (source.fetchMedia) {
			blob = await source.fetchMedia(url, input);
		} else {
			const res = await doFetch(url);
			if (!res.ok) throw new Error(`download failed with ${res.status}`);
			blob = await res.blob();
		}
		const name = decodeURIComponent(basename(new URL(url, "file:///").pathname)) || "image";
		return api.uploadMedia(blob, name, alt);
	}

	log("");
	const postTypes = [...targets.keys()];
	for await (const item of source.fetchContent(input, { postTypes, includeDrafts: true })) {
		const target = targets.get(item.postType);
		if (!target) continue;
		const label = `${target.slug}/${item.slug}`;

		try {
			if (await api.findEntry(target.slug, item.slug)) {
				summary.skipped.push(label);
				log(`skipped  ${label} (already exists)`);
				continue;
			}

			const data: Record<string, unknown> = {
				title: item.title,
				[field]: await rewriteImages(item.content, upload),
			};
			if (item.excerpt && target.fields.has("excerpt")) data["excerpt"] = item.excerpt;
			if (item.featuredImage && target.fields.get("featured_image") === "image") {
				const media = await upload(item.featuredImage);
				if (media) data["featured_image"] = mediaValue(media);
			}

			const seo: Seo = { ...extraSeo.get(item.slug) };
			if (typeof item.meta?.["seoTitle"] === "string") seo.title = item.meta["seoTitle"];
			if (typeof item.meta?.["seoDescription"] === "string") {
				seo.description = item.meta["seoDescription"];
			}

			const terms: Record<string, string[]> = {};
			for (const [taxonomy, slugs] of [
				["tag", item.tags],
				["category", item.categories],
			] as const) {
				if (!slugs?.length) continue;
				const assigned = await taxonomies.ensure(taxonomy, target.slug, slugs, tagLabels);
				if (assigned.length) terms[taxonomy] = assigned;
			}

			const isPublished = item.status === "publish";
			const date = item.date.toISOString();
			let entry: { id: string };
			try {
				entry = await api.createEntry(target.slug, {
					slug: item.slug,
					data,
					createdAt: date,
					// Set even when the entry is created as a draft: publishing later
					// keeps an existing date, so the post shows when it really went out.
					publishedAt: isPublished ? date : undefined,
					seo: Object.keys(seo).length ? seo : undefined,
					taxonomies: Object.keys(terms).length ? terms : undefined,
				});
			} catch (error) {
				// Covers a slug held by a trashed entry, which the lookup above misses.
				if (error instanceof ApiError && error.code === "SLUG_CONFLICT") {
					summary.skipped.push(label);
					log(`skipped  ${label} (slug already taken)`);
					continue;
				}
				throw error;
			}

			const publishNow = isPublished && options.publish;
			if (publishNow) await api.publish(target.slug, entry.id);
			summary.created.push(label);
			log(`created  ${label}${publishNow ? " (published)" : " (draft)"}`);
		} catch (error) {
			const reason = errorMessage(error);
			summary.failed.push({ slug: label, reason });
			log(`failed   ${label}: ${reason}`);
		}
	}

	log("");
	log(
		`Done: ${summary.created.length} created, ${summary.skipped.length} skipped, ${summary.failed.length} failed.`,
	);
	for (const failure of summary.failed) log(`  ${failure.slug}: ${failure.reason}`);
	return summary;
}

async function loadSource(
	options: ImportOptions,
	collection: string,
	bytes: Buffer,
	onWarn: (message: string) => void,
): Promise<{ source: Source; tagLabels: Map<string, string>; seo: Map<string, Seo> }> {
	const tagLabels = new Map<string, string>();
	const seo = new Map<string, Seo>();

	if (options.source === "ghost") {
		const ghost = await import("@plugdash/fromghost");
		try {
			const raw: unknown = JSON.parse(bytes.toString("utf8"));
			const { data } = ghost.parseGhostExport(raw);
			for (const tag of data.tags) {
				if (tag.slug && tag.name) tagLabels.set(tag.slug, tag.name);
			}
			readPostsMeta(raw, data.posts, seo);
		} catch {
			// analyze() reports a broken export with a better message.
		}
		const source = ghost.createGhostSource({
			targetCollection: collection,
			siteUrl: options.siteUrl,
			onWarn,
		});
		return { source: source as unknown as Source, tagLabels, seo };
	}

	const substack = await import("@plugdash/fromsubstack");
	// Built as a plain object: onWarn exists in some versions of the source and
	// not others, and an object literal would trip excess-property checks.
	const config: Record<string, unknown> = {
		targetCollection: collection,
		status: "published",
		onWarn,
	};
	const source = substack.createSubstackSource(config);
	return { source: source as unknown as Source, tagLabels, seo };
}

/**
 * Ghost 4+ keeps meta_title / meta_description in a separate posts_meta table,
 * which the Ghost source does not read. Collect them by post slug so SEO
 * fields still come across.
 */
function readPostsMeta(
	raw: unknown,
	posts: { id?: string | null; slug?: string | null }[],
	out: Map<string, Seo>,
) {
	const root = raw as { db?: { data?: Record<string, unknown> }[]; data?: Record<string, unknown> };
	const rows = (root.db?.[0]?.data ?? root.data)?.["posts_meta"];
	if (!Array.isArray(rows)) return;
	const slugById = new Map(posts.map((p) => [p.id, p.slug]));
	for (const row of rows as Record<string, unknown>[]) {
		const slug = slugById.get(row["post_id"] as string);
		if (!slug) continue;
		const entry: Seo = {};
		if (typeof row["meta_title"] === "string" && row["meta_title"]) entry.title = row["meta_title"];
		if (typeof row["meta_description"] === "string" && row["meta_description"]) {
			entry.description = row["meta_description"];
		}
		if (entry.title || entry.description) out.set(slug, entry);
	}
}

function fieldMap(schema: Collection) {
	return new Map((schema.fields ?? []).map((f) => [f.slug, { type: f.type }]));
}

/** Creates any missing terms and returns the slugs that can be assigned. */
async function loadTaxonomies(api: Api, warn: (message: string) => void) {
	const known = await api.taxonomies().catch(() => []);
	const terms = new Map<string, Promise<Set<string>>>();
	const warned = new Set<string>();

	return {
		async ensure(
			taxonomy: string,
			collection: string,
			slugs: readonly string[],
			labels: Map<string, string>,
		): Promise<string[]> {
			const def = known.find((t) => t.name === taxonomy);
			if (!def || (def.collections && !def.collections.includes(collection))) {
				const key = `${taxonomy}:${collection}`;
				if (!warned.has(key)) {
					warned.add(key);
					warn(`no "${taxonomy}" taxonomy on ${collection}, ${taxonomy}s were not imported`);
				}
				return [];
			}
			let existing = terms.get(taxonomy);
			if (!existing) {
				existing = api.termSlugs(taxonomy);
				terms.set(taxonomy, existing);
			}
			const have = await existing;
			for (const slug of slugs) {
				if (have.has(slug)) continue;
				await api.createTerm(taxonomy, slug, labels.get(slug) ?? slug);
				have.add(slug);
			}
			return [...slugs];
		},
	};
}

async function rewriteImages(
	content: unknown[],
	upload: (url: string, alt?: string) => Promise<MediaItem | null>,
): Promise<unknown[]> {
	return Promise.all(
		content.map(async (node) => {
			const block = node as Block;
			const url = block?._type === "image" ? (block.asset?.url ?? block.asset?._ref) : undefined;
			if (!url) return node;
			const media = await upload(url, block.alt);
			if (!media) return node;
			return {
				...block,
				asset: { _type: "reference", _ref: media.id, url: media.url },
				width: media.width ?? undefined,
				height: media.height ?? undefined,
			};
		}),
	);
}

function mediaValue(media: MediaItem) {
	return {
		provider: "local",
		id: media.id,
		width: media.width ?? undefined,
		height: media.height ?? undefined,
		mimeType: media.mimeType,
		filename: media.filename,
		meta: { storageKey: media.storageKey },
	};
}

function resolveUrl(url: string, siteUrl?: string): string {
	if (!url.startsWith(GHOST_URL) || !siteUrl) return url;
	const path = url.slice(GHOST_URL.length);
	return `${siteUrl.replace(/\/+$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
