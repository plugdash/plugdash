// @plugdash/socialcard - card rendering
//
// Pure and synchronous: no plugin context, no I/O. Takes the handful of
// fields a post exposes and returns a finished SVG document. Kept in its
// own module so it can be unit tested directly and reused from a theme.
//
// ponytail: cards are emitted as SVG rather than raster PNG. Satori + resvg
// (the spec's pipeline) need a font binary and a .wasm blob loaded at
// runtime, and a sandboxed plugin bundle has no way to load either - it
// ships as a single bundled JS file with no network capability. Every other
// plugin in this repo is zero-runtime-dependency for the same reason.
// Upgrade path: once the sandbox can ship binary assets alongside the entry
// bundle, swap renderCard's return for satori(...) -> resvg(...) -> PNG and
// change CARD_MIME / the filename extension. The layout maths below carries
// over unchanged. Note that some OG consumers (Twitter, Facebook) reject
// image/svg+xml, so raster output is the real target.

import type { SocialcardConfig } from "./index.ts";

export type CardTemplate = "default" | "minimal" | "bold";

export interface CardInput {
	title: string;
	author?: string | null;
	publishedAt?: string | null;
}

export interface ResolvedCardConfig {
	template: CardTemplate;
	width: number;
	height: number;
	background: string;
	foreground: string;
	titleFont: string;
	bodyFont: string;
	logo: string | null;
}

/** Media type of the generated card. */
export const CARD_MIME = "image/svg+xml";

/** Titles longer than this are truncated with an ellipsis. */
export const MAX_TITLE_LENGTH = 80;

const SYSTEM_FONT =
	"ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

const TEMPLATES: readonly CardTemplate[] = ["default", "minimal", "bold"];

// ── Config ──

function positive(value: unknown, fallback: number): number {
	return typeof value === "number" && Number.isFinite(value) && value > 0
		? Math.round(value)
		: fallback;
}

function nonEmpty(value: unknown, fallback: string): string {
	return typeof value === "string" && value.trim().length > 0
		? value.trim()
		: fallback;
}

export function resolveConfig(config?: SocialcardConfig): ResolvedCardConfig {
	const requested = config?.template as CardTemplate | undefined;
	return {
		template:
			requested !== undefined && TEMPLATES.includes(requested)
				? requested
				: "default",
		width: positive(config?.width, 1200),
		height: positive(config?.height, 630),
		background: nonEmpty(config?.background, "#0f172a"),
		foreground: nonEmpty(config?.foreground, "#f8fafc"),
		titleFont: nonEmpty(config?.fonts?.title, SYSTEM_FONT),
		bodyFont: nonEmpty(config?.fonts?.body, SYSTEM_FONT),
		logo: nonEmpty(config?.logo, "") || null,
	};
}

// ── Text helpers ──

export function escapeXml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&apos;");
}

/** Collapses whitespace and cuts overlong titles down to MAX_TITLE_LENGTH. */
export function truncateTitle(
	title: string,
	max: number = MAX_TITLE_LENGTH,
): string {
	const clean = title.trim().replace(/\s+/g, " ");
	if (clean.length <= max) return clean;
	return `${clean.slice(0, max - 1).trimEnd()}…`;
}

/** Greedy word wrap. Words longer than the limit get a line of their own. */
export function wrapText(text: string, maxChars: number): string[] {
	const limit = Math.max(1, maxChars);
	const lines: string[] = [];
	let line = "";
	for (const word of text.split(" ").filter((w) => w.length > 0)) {
		if (line.length === 0) {
			line = word;
		} else if (line.length + 1 + word.length > limit) {
			lines.push(line);
			line = word;
		} else {
			line = `${line} ${word}`;
		}
	}
	if (line.length > 0) lines.push(line);
	return lines;
}

/** Formats an ISO timestamp as "January 1, 2026". Returns null if unusable. */
export function formatDate(iso?: string | null): string | null {
	if (typeof iso !== "string" || iso.trim().length === 0) return null;
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return null;
	return date.toLocaleDateString("en-US", {
		year: "numeric",
		month: "long",
		day: "numeric",
		timeZone: "UTC",
	});
}

/** Author and date joined with a separator. Either half may be missing. */
export function buildByline(input: CardInput): string | null {
	const author =
		typeof input.author === "string" && input.author.trim().length > 0
			? input.author.trim()
			: null;
	const parts = [author, formatDate(input.publishedAt)].filter(
		(part): part is string => part !== null,
	);
	return parts.length > 0 ? parts.join(" · ") : null;
}

// ── SVG building blocks ──

// Average glyph advance as a fraction of font size. Good enough for the
// system sans stacks we default to; a custom font may wrap a little early.
const GLYPH_RATIO = 0.52;

function charsPerLine(available: number, fontSize: number): number {
	return Math.max(8, Math.floor(available / (fontSize * GLYPH_RATIO)));
}

function titleText(
	lines: string[],
	x: number,
	lastBaseline: number,
	fontSize: number,
	fill: string,
	font: string,
): string {
	const lineHeight = Math.round(fontSize * 1.18);
	const firstBaseline = lastBaseline - (lines.length - 1) * lineHeight;
	const tspans = lines
		.map(
			(line, i) =>
				`<tspan x="${x}" y="${firstBaseline + i * lineHeight}">${escapeXml(line)}</tspan>`,
		)
		.join("");
	return `<text font-family="${escapeXml(font)}" font-size="${fontSize}" font-weight="700" fill="${escapeXml(fill)}">${tspans}</text>`;
}

function bylineText(
	byline: string,
	x: number,
	baseline: number,
	fontSize: number,
	fill: string,
	font: string,
): string {
	return `<text x="${x}" y="${baseline}" font-family="${escapeXml(font)}" font-size="${fontSize}" font-weight="400" fill="${escapeXml(fill)}" opacity="0.78">${escapeXml(byline)}</text>`;
}

function logoImage(
	logo: string | null,
	x: number,
	y: number,
	size: number,
): string {
	if (!logo) return "";
	return `<image href="${escapeXml(logo)}" x="${x}" y="${y}" width="${size}" height="${size}" preserveAspectRatio="xMidYMid meet"/>`;
}

function svgDocument(
	c: ResolvedCardConfig,
	label: string,
	defs: string,
	body: string,
): string {
	const open = `<svg xmlns="http://www.w3.org/2000/svg" width="${c.width}" height="${c.height}" viewBox="0 0 ${c.width} ${c.height}" role="img" aria-label="${escapeXml(label)}">`;
	const defsBlock = defs.length > 0 ? `<defs>${defs}</defs>` : "";
	return `${open}${defsBlock}${body}</svg>`;
}

// ── Templates ──

/** Title large, author + date small, subtle gradient. */
function renderDefault(
	title: string,
	byline: string | null,
	c: ResolvedCardConfig,
): string {
	const pad = Math.round(c.width * 0.0667);
	const titleSize = Math.round(c.width * 0.0533);
	const bodySize = Math.round(c.width * 0.0233);
	const logoSize = Math.round(c.width * 0.08);
	const lines = wrapText(title, charsPerLine(c.width - pad * 2, titleSize));

	const bylineBaseline = c.height - pad;
	const titleBaseline = byline
		? bylineBaseline - Math.round(bodySize * 2.4)
		: bylineBaseline;

	const defs =
		`<linearGradient id="sc-bg" x1="0" y1="0" x2="1" y2="1">` +
		`<stop offset="0%" stop-color="${escapeXml(c.background)}"/>` +
		`<stop offset="100%" stop-color="${escapeXml(c.foreground)}" stop-opacity="0.18"/>` +
		`</linearGradient>`;

	const body =
		`<rect width="${c.width}" height="${c.height}" fill="${escapeXml(c.background)}"/>` +
		`<rect width="${c.width}" height="${c.height}" fill="url(#sc-bg)"/>` +
		logoImage(c.logo, pad, pad, logoSize) +
		titleText(lines, pad, titleBaseline, titleSize, c.foreground, c.titleFont) +
		(byline
			? bylineText(
					byline,
					pad,
					bylineBaseline,
					bodySize,
					c.foreground,
					c.bodyFont,
				)
			: "");

	return svgDocument(c, byline ? `${title} - ${byline}` : title, defs, body);
}

/**
 * Title only, clean white. The palette is inverted so the defaults land on
 * near-white paper with dark type, while a custom palette still applies.
 */
function renderMinimal(title: string, c: ResolvedCardConfig): string {
	const paper = c.foreground;
	const ink = c.background;
	const pad = Math.round(c.width * 0.0833);
	const titleSize = Math.round(c.width * 0.05);
	const lines = wrapText(title, charsPerLine(c.width - pad * 2, titleSize));
	const lineHeight = Math.round(titleSize * 1.18);
	const blockHeight = lines.length * lineHeight;
	const titleBaseline = Math.round((c.height + blockHeight - lineHeight) / 2);

	const body =
		`<rect width="${c.width}" height="${c.height}" fill="${escapeXml(paper)}"/>` +
		`<rect x="${pad}" y="${pad}" width="${Math.round(c.width * 0.06)}" height="4" fill="${escapeXml(ink)}" opacity="0.4"/>` +
		titleText(lines, pad, titleBaseline, titleSize, ink, c.titleFont);

	return svgDocument(c, title, "", body);
}

/** Large type against a strong colour block. */
function renderBold(
	title: string,
	byline: string | null,
	c: ResolvedCardConfig,
): string {
	const pad = Math.round(c.width * 0.0667);
	const blockWidth = Math.round(c.width * 0.1);
	const contentX = blockWidth + pad;
	const titleSize = Math.round(c.width * 0.065);
	const bodySize = Math.round(c.width * 0.0233);
	const logoSize = Math.round(c.width * 0.08);
	const lines = wrapText(
		title,
		charsPerLine(c.width - contentX - pad, titleSize),
	);

	const bylineBaseline = c.height - pad;
	const titleBaseline = byline
		? bylineBaseline - Math.round(bodySize * 2.4)
		: bylineBaseline;

	const body =
		`<rect width="${c.width}" height="${c.height}" fill="${escapeXml(c.background)}"/>` +
		`<rect x="0" y="0" width="${blockWidth}" height="${c.height}" fill="${escapeXml(c.foreground)}"/>` +
		logoImage(c.logo, contentX, pad, logoSize) +
		titleText(
			lines,
			contentX,
			titleBaseline,
			titleSize,
			c.foreground,
			c.titleFont,
		) +
		(byline
			? bylineText(
					byline,
					contentX,
					bylineBaseline,
					bodySize,
					c.foreground,
					c.bodyFont,
				)
			: "");

	return svgDocument(c, byline ? `${title} - ${byline}` : title, "", body);
}

// ── Entry point ──

/** Renders the OG card for a post as a standalone SVG document. */
export function renderCard(input: CardInput, config?: SocialcardConfig): string {
	const c = resolveConfig(config);
	const title = truncateTitle(input.title ?? "");
	const byline = buildByline(input);

	switch (c.template) {
		case "minimal":
			return renderMinimal(title, c);
		case "bold":
			return renderBold(title, byline, c);
		default:
			return renderDefault(title, byline, c);
	}
}

/** Stable per-post filename, so republishing overwrites the same asset. */
export function cardFilename(contentId: string): string {
	const safe = contentId.replace(/[^a-zA-Z0-9_-]/g, "-");
	return `og-${safe}.svg`;
}
