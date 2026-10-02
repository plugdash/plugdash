// @plugdash/fromghost - import a Ghost JSON export into EmDash.
//
// Plugs into EmDash's import-source registry (registered in createPlugin, so
// config reaches the production runtime) and reuses the runtime's media
// download, taxonomy and content-creation pipeline.

import { definePlugin, registerSource, slugify } from "emdash";
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
import type { PluginDescriptor } from "@plugdash/types";
import type { PortableTextBlock } from "@plugdash/html-to-portable-text";
import {
	buildJoinIndex,
	buildTagLookup,
	buildUserLookup,
	describeImageUrl,
	ghostPostType,
	isAbsoluteUrl,
	lexicalToHtml,
	mapGhostStatus,
	parseGhostDate,
	parseGhostExport,
	resolveGhostUrl,
} from "./ghost-export.ts";
import type {
	GhostData,
	GhostPost,
	GhostTag,
	GhostUser,
} from "./ghost-export.ts";
import pkg from "../package.json" with { type: "json" };

const VERSION = pkg.version;
const SOURCE_ID = "ghost";

export interface FromghostConfig {
	/** Collection suggested for Ghost posts in the import UI. Default "posts". */
	targetCollection?: string;
	/** Keep Ghost slugs. When false they are regenerated from the title. Default true. */
	preserveSlugs?: boolean;
	/** Carry feature images and inline images over. Default true. */
	importImages?: boolean;
	/** Carry Ghost tags over as taxonomy terms. Default true. */
	importTags?: boolean;
	/**
	 * The site the export came from. Ghost stores media as
	 * `__GHOST_URL__/content/images/...`; without this the placeholder can only
	 * resolve to a site-relative path, which the importer cannot download.
	 */
	siteUrl?: string;
	/**
	 * What to do with Ghost posts whose visibility is not public (members, paid,
	 * tiers). Their full body is in the export, so the default keeps them out of
	 * the public site. Default "draft".
	 */
	paidPostsAs?: "draft" | "publish" | "skip";
	/**
	 * Programmatic use only. Functions do not survive astro.config options, so
	 * read `analysis.warnings` instead.
	 */
	onWarn?: (message: string) => void;
}

type HtmlConverter = (html: string) => PortableTextBlock[];

/** `ImportAnalysis` has no warnings field in emdash 1.0.1, so it is added here. */
export type GhostImportAnalysis = ImportAnalysis & { warnings: string[] };

interface ResolvedConfig {
	targetCollection: string;
	preserveSlugs: boolean;
	importImages: boolean;
	importTags: boolean;
	siteUrl: string;
	paidPostsAs: "draft" | "publish" | "skip";
	warn: (message: string) => void;
}

function resolveConfig(config: FromghostConfig): ResolvedConfig {
	return {
		targetCollection: config.targetCollection ?? "posts",
		preserveSlugs: config.preserveSlugs ?? true,
		importImages: config.importImages ?? true,
		importTags: config.importTags ?? true,
		siteUrl: config.siteUrl ?? "",
		paidPostsAs: config.paidPostsAs ?? "draft",
		warn: config.onWarn ?? (() => {}),
	};
}

// ── Body conversion ──

const GHOST_URL_PLACEHOLDER = "__GHOST_URL__";

/** Swaps every `__GHOST_URL__` in the HTML for the real site URL. */
function resolveHtmlUrls(html: string, siteUrl: string): string {
	if (!html.includes(GHOST_URL_PLACEHOLDER)) return html;
	return html.replaceAll(GHOST_URL_PLACEHOLDER, siteUrl.replace(/\/+$/, ""));
}

/** Loaded on first use: the converter pulls in linkedom (~90 ms), and an import runs once. */
async function loadConverter(): Promise<HtmlConverter> {
	const { htmlToPortableText } = await import("@plugdash/html-to-portable-text");
	return htmlToPortableText;
}

function isRestricted(post: GhostPost): boolean {
	return !!post.visibility && post.visibility !== "public";
}

type ImportBlock = NormalizedItem["content"][number];

/**
 * The shared converter keeps image assets loose (it has no media access) and
 * emits bare `break` blocks. EmDash's import pipeline wants an explicit
 * reference asset and a style on breaks, so the two are bridged here rather
 * than in the shared package, which other consumers use without the pipeline.
 */
function toImportContent(blocks: PortableTextBlock[]): ImportBlock[] {
	return blocks.map((block): ImportBlock => {
		if (block._type === "image") {
			return {
				...block,
				asset: {
					_type: "reference",
					_ref: block.asset._ref,
					url: block.asset.url,
				},
			};
		}
		if (block._type === "break") {
			return { _type: "break", _key: block._key, style: "lineBreak" };
		}
		return block as ImportBlock;
	});
}

function resolveBody(
	post: GhostPost,
	title: string,
	config: ResolvedConfig,
	convert: HtmlConverter,
): PortableTextBlock[] {
	const blocks = convertBody(post, title, config, convert);
	if (config.importImages) return blocks;
	return blocks.filter((block) => block._type !== "image");
}

function convertBody(
	post: GhostPost,
	title: string,
	config: ResolvedConfig,
	convert: HtmlConverter,
): PortableTextBlock[] {
	const html = post.html?.trim();
	if (html) return convert(resolveHtmlUrls(html, config.siteUrl));

	if (post.lexical) {
		const recovered = lexicalToHtml(post.lexical);
		if (recovered) {
			config.warn(
				`"${title}": no rendered HTML, recovered plain text from the Lexical draft`,
			);
			return convert(recovered);
		}
		config.warn(
			`"${title}": Lexical content could not be converted, body left empty`,
		);
		return [];
	}

	if (post.mobiledoc) {
		config.warn(
			`"${title}": no rendered HTML and Mobiledoc conversion is unsupported, body left empty`,
		);
	}
	return [];
}

// ── Field mapping ──

interface MappingContext {
	config: ResolvedConfig;
	convert: HtmlConverter;
	tags: Map<string, GhostTag>;
	users: Map<string, GhostUser>;
	tagsByPost: Map<string, string[]>;
	authorsByPost: Map<string, string[]>;
}

function buildMappingContext(
	data: GhostData,
	config: ResolvedConfig,
	convert: HtmlConverter,
): MappingContext {
	return {
		config,
		convert,
		tags: buildTagLookup(data.tags),
		users: buildUserLookup(data.users),
		tagsByPost: buildJoinIndex(data.posts_tags, "tag_id"),
		authorsByPost: buildJoinIndex(data.posts_authors, "author_id"),
	};
}

function resolveTags(
	postId: string,
	title: string,
	ctx: MappingContext,
): string[] | undefined {
	const tagIds = ctx.tagsByPost.get(postId);
	if (!tagIds || tagIds.length === 0) return undefined;

	const slugs: string[] = [];
	for (const tagId of tagIds) {
		const tag = ctx.tags.get(tagId);
		if (!tag) {
			ctx.config.warn(`"${title}": tag ${tagId} is not in the export, skipping`);
			continue;
		}
		// Ghost's internal tags are bookkeeping, not taxonomy.
		if (tag.visibility === "internal") continue;
		const slug = tag.slug ?? slugify(tag.name ?? "");
		if (slug) slugs.push(slug);
	}
	return slugs.length > 0 ? slugs : undefined;
}

function resolveAuthor(
	postId: string,
	ctx: MappingContext,
): string | undefined {
	const authorId = ctx.authorsByPost.get(postId)?.[0];
	if (!authorId) return undefined;
	const user = ctx.users.get(authorId);
	return user?.slug ?? user?.name ?? undefined;
}

function resolveSlug(post: GhostPost, title: string, index: number, config: ResolvedConfig): string {
	if (config.preserveSlugs && post.slug) return post.slug;
	return slugify(title) || `ghost-${post.id ?? index}`;
}

function itemStatus(post: GhostPost, config: ResolvedConfig): NormalizedItem["status"] {
	const status = mapGhostStatus(post.status);
	if (status === "publish" && isRestricted(post) && config.paidPostsAs === "draft") {
		return "draft";
	}
	return status;
}

/** Maps one Ghost post onto EmDash's normalized import item. */
export function toNormalizedItem(
	post: GhostPost,
	slug: string,
	ctx: MappingContext,
): NormalizedItem {
	const { config } = ctx;
	const postId = post.id ?? "";
	const title = post.title?.trim() || "Untitled";

	const meta: Record<string, unknown> = {};
	if (post.meta_title) meta["seoTitle"] = post.meta_title;
	if (post.meta_description) meta["seoDescription"] = post.meta_description;
	if (post.visibility) meta["visibility"] = post.visibility;
	if (post.uuid) meta["ghostUuid"] = post.uuid;

	const featureImage = config.importImages
		? resolveGhostUrl(post.feature_image, config.siteUrl)
		: undefined;
	const downloadable = featureImage && isAbsoluteUrl(featureImage);
	if (featureImage && !downloadable) {
		config.warn(
			`"${title}": feature image "${featureImage}" is site-relative, set siteUrl to import it`,
		);
	}

	return {
		sourceId: postId || slug,
		postType: ghostPostType(post),
		status: itemStatus(post, config),
		slug,
		title,
		content: toImportContent(resolveBody(post, title, config, ctx.convert)),
		excerpt: (post.custom_excerpt ?? post.excerpt) || undefined,
		date:
			parseGhostDate(post.published_at) ??
			parseGhostDate(post.created_at) ??
			new Date(),
		modified: parseGhostDate(post.updated_at),
		author: resolveAuthor(postId, ctx),
		tags: config.importTags ? resolveTags(postId, title, ctx) : undefined,
		meta: Object.keys(meta).length > 0 ? meta : undefined,
		featuredImage: downloadable ? featureImage : undefined,
	};
}

// ── Analysis ──

type ExistingCollections = Map<
	string,
	{ slug: string; fields: Map<string, { type: string }> }
>;

const BASE_FIELDS: ImportFieldDef[] = [
	{ slug: "title", label: "Title", type: "string", required: true, searchable: true },
	{ slug: "content", label: "Content", type: "portableText", required: false, searchable: true },
	{ slug: "excerpt", label: "Excerpt", type: "text", required: false },
];

const FEATURED_IMAGE_FIELD: ImportFieldDef = {
	slug: "featured_image",
	label: "Featured Image",
	type: "image",
	required: false,
};

/** Field types EmDash can store a given import type in, beyond an exact match. */
const TYPE_ALIASES: Record<string, string[]> = {
	string: ["string", "text", "slug"],
	text: ["string", "text"],
	portableText: ["portableText", "json"],
};

function isTypeCompatible(requiredType: string, existingType: string): boolean {
	if (requiredType === existingType) return true;
	return TYPE_ALIASES[requiredType]?.includes(existingType) ?? false;
}

function checkSchema(
	requiredFields: ImportFieldDef[],
	existing: { fields: Map<string, { type: string }> } | undefined,
): CollectionSchemaStatus {
	const fieldStatus: CollectionSchemaStatus["fieldStatus"] = {};
	if (!existing) {
		for (const field of requiredFields) {
			fieldStatus[field.slug] = { status: "missing", requiredType: field.type };
		}
		return { exists: false, fieldStatus, canImport: true };
	}

	const incompatible: string[] = [];
	for (const field of requiredFields) {
		const existingField = existing.fields.get(field.slug);
		if (!existingField) {
			fieldStatus[field.slug] = { status: "missing", requiredType: field.type };
		} else if (isTypeCompatible(field.type, existingField.type)) {
			fieldStatus[field.slug] = {
				status: "compatible",
				existingType: existingField.type,
				requiredType: field.type,
			};
		} else {
			fieldStatus[field.slug] = {
				status: "type_mismatch",
				existingType: existingField.type,
				requiredType: field.type,
			};
			incompatible.push(field.slug);
		}
	}

	return {
		exists: true,
		fieldStatus,
		canImport: incompatible.length === 0,
		reason:
			incompatible.length === 0
				? undefined
				: `Incompatible field types: ${incompatible.join(", ")}`,
	};
}

function siteTitle(data: GhostData): string {
	for (const setting of data.settings) {
		if (setting.key === "title" && setting.value) return setting.value;
	}
	return "Ghost Site";
}

/** Summarizes what a Ghost export contains, for the import preview screen. */
export function analyzeGhostExport(
	data: GhostData,
	existingCollections: ExistingCollections,
	config: ResolvedConfig,
	convert: HtmlConverter,
): GhostImportAnalysis {
	const warnings: string[] = [];
	const mapping = buildMappingContext(
		data,
		{
			...config,
			warn: (message) => {
				warnings.push(message);
				config.warn(message);
			},
		},
		convert,
	);
	const counts = new Map<"post" | "page", number>();
	const typesWithFeatureImage = new Set<string>();
	const images = new Map<string, AttachmentInfo>();
	const authorPostCounts = new Map<string, number>();

	const users = buildUserLookup(data.users);
	const authorsByPost = buildJoinIndex(data.posts_authors, "author_id");

	for (const post of data.posts) {
		const postType = ghostPostType(post);
		counts.set(postType, (counts.get(postType) ?? 0) + 1);

		const featureImage = config.importImages
			? resolveGhostUrl(post.feature_image, config.siteUrl)
			: undefined;
		if (featureImage) {
			typesWithFeatureImage.add(postType);
			images.set(featureImage, {
				title: post.feature_image_alt ?? post.title ?? undefined,
				url: featureImage,
				alt: post.feature_image_alt ?? undefined,
				caption: post.feature_image_caption ?? undefined,
				...describeImageUrl(featureImage),
			});
		}

		if (config.importImages) {
			const item = toNormalizedItem(post, post.slug ?? "", mapping);
			for (const block of item.content) {
				const url = block._type === "image" ? block.asset?.url : undefined;
				if (!url || images.has(url)) continue;
				images.set(url, { url, ...describeImageUrl(url) });
			}
		}

		for (const authorId of authorsByPost.get(post.id ?? "") ?? []) {
			const key = users.get(authorId)?.slug ?? authorId;
			authorPostCounts.set(key, (authorPostCounts.get(key) ?? 0) + 1);
		}
	}

	const postTypes = [...counts.entries()]
		.map(([name, count]) => {
			const suggestedCollection =
				name === "post" ? config.targetCollection : "pages";
			const requiredFields = typesWithFeatureImage.has(name)
				? [...BASE_FIELDS, FEATURED_IMAGE_FIELD]
				: [...BASE_FIELDS];
			return {
				name,
				count,
				suggestedCollection,
				requiredFields,
				schemaStatus: checkSchema(
					requiredFields,
					existingCollections.get(suggestedCollection),
				),
			};
		})
		.sort((a, b) => b.count - a.count);

	const publicTags = data.tags.filter((tag) => tag.visibility !== "internal");

	return {
		sourceId: SOURCE_ID,
		site: { title: siteTitle(data), url: config.siteUrl },
		postTypes,
		attachments: { count: images.size, items: [...images.values()] },
		warnings,
		// Ghost has no category taxonomy - tags are the only one.
		categories: 0,
		tags: config.importTags ? publicTags.length : 0,
		authors: data.users.map((user) => ({
			login: user.slug ?? undefined,
			email: user.email ?? undefined,
			displayName: user.name ?? user.slug ?? "Unknown",
			postCount: user.slug ? (authorPostCounts.get(user.slug) ?? 0) : 0,
		})),
	};
}

// ── Import source ──

async function readExport(input: SourceInput) {
	if (input.type !== "file") {
		throw new Error("The Ghost source requires a Ghost JSON export file");
	}
	const text: string = await input.file.text();
	let raw: unknown;
	try {
		raw = JSON.parse(text);
	} catch {
		throw new Error("Ghost export is not valid JSON");
	}
	return parseGhostExport(raw);
}

export function createGhostSource(config: FromghostConfig = {}): ImportSource {
	const resolved = resolveConfig(config);

	return {
		id: SOURCE_ID,
		name: "Ghost Export File",
		description:
			"Upload a Ghost JSON export (Ghost admin: Settings > Labs > Export your content)",
		icon: "upload",
		requiresFile: true,
		canProbe: false,

		async analyze(
			input: SourceInput,
			context: ImportContext,
		): Promise<GhostImportAnalysis> {
			const { data } = await readExport(input);
			const convert = await loadConverter();
			const existing = context.getExistingCollections
				? await context.getExistingCollections()
				: (new Map() as ExistingCollections);
			return analyzeGhostExport(data, existing, resolved, convert);
		},

		async *fetchContent(
			input: SourceInput,
			options: FetchOptions,
		): AsyncGenerator<NormalizedItem> {
			const { data } = await readExport(input);
			const ctx = buildMappingContext(data, resolved, await loadConverter());
			const seen = new Set<string>();
			let emitted = 0;

			for (const [index, post] of data.posts.entries()) {
				const postType = ghostPostType(post);
				if (!options.postTypes.includes(postType)) continue;
				if (!options.includeDrafts && mapGhostStatus(post.status) !== "publish") {
					continue;
				}

				const title = post.title?.trim() || "Untitled";
				const slug = resolveSlug(post, title, index, resolved);
				const seenKey = `${postType}:${slug}`;
				if (seen.has(seenKey)) {
					resolved.warn(`"${title}": duplicate slug "${slug}", skipping`);
					continue;
				}
			seen.add(seenKey);

			if (
				resolved.paidPostsAs === "skip" &&
				isRestricted(post) &&
				mapGhostStatus(post.status) === "publish"
			) {
				resolved.warn(`"${title}": ${post.visibility} post, skipping`);
				continue;
			}

				yield toNormalizedItem(post, slug, ctx);

				emitted++;
				if (options.limit && emitted >= options.limit) break;
			}
		},
	};
}

/** A zero-config source. Not registered anywhere: createPlugin registers the configured one. */
export const ghostSource: ImportSource = createGhostSource();

// ── Plugin ──

export function fromghostPlugin(
	config: FromghostConfig = {},
): PluginDescriptor<FromghostConfig> {
	return {
		id: "fromghost",
		version: VERSION,
		format: "native",
		entrypoint: "@plugdash/fromghost",
		options: config,
		capabilities: ["content:write", "media:write"],
	};
}

/**
 * Runs in the server runtime with the descriptor options inlined as JSON, so
 * this is where the configured source has to be registered.
 */
export function createPlugin(options: FromghostConfig = {}) {
	registerSource(createGhostSource(options));
	return definePlugin({
		id: "fromghost",
		version: VERSION,
		hooks: {},
	});
}

export default createPlugin;

export type {
	GhostData,
	GhostJoinRow,
	GhostPost,
	GhostSetting,
	GhostTag,
	GhostUser,
	ParsedGhostExport,
} from "./ghost-export.ts";
export {
	buildJoinIndex,
	buildTagLookup,
	buildUserLookup,
	ghostPostType,
	lexicalToHtml,
	mapGhostStatus,
	parseGhostExport,
	resolveGhostUrl,
} from "./ghost-export.ts";
