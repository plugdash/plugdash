// @plugdash/html-to-portable-text
//
// Converts a fragment of post-body HTML (as exported by Ghost, Substack, or
// similar platforms) into EmDash Portable Text blocks. Pure and synchronous:
// image blocks keep the original <img src> as the asset ref/url, since
// downloading and re-uploading media is the importer's job (it needs
// ctx.media, which this package doesn't have access to).
import { parseHTML } from "linkedom";
import type {
	PortableTextTextBlock,
	PortableTextSpan,
	PortableTextMarkDef,
	PortableTextImageBlock,
	PortableTextCodeBlock,
} from "emdash";

/**
 * emdash's own .d.mts bundles two structurally different internal types both
 * named `PortableTextBlock` (one from its converters module, one from its
 * gutenberg-import module), so the plain union name resolves ambiguously.
 * The per-variant types (PortableTextTextBlock etc.) are unambiguous, so we
 * build our own union from those instead of importing the collided name.
 */
export interface PortableTextBreakBlock {
	_type: "break";
	_key: string;
}

export type PortableTextBlock =
	| PortableTextTextBlock
	| PortableTextImageBlock
	| PortableTextCodeBlock
	| PortableTextBreakBlock;

const MARK_TAGS: Record<string, string> = {
	strong: "strong",
	b: "strong",
	em: "em",
	i: "em",
	code: "code",
	del: "strike-through",
	s: "strike-through",
	u: "underline",
};

const HEADING_STYLE: Record<string, PortableTextTextBlock["style"]> = {
	h1: "h1",
	h2: "h2",
	h3: "h3",
	h4: "h4",
	h5: "h5",
	h6: "h6",
};

let keyCounter = 0;

function nextKey(): string {
	keyCounter += 1;
	return `htpt-${keyCounter}`;
}

/** Resets the block-key counter. Call between conversions in tests that assert exact keys. */
export function resetKeyCounter(): void {
	keyCounter = 0;
}

interface InlineResult {
	spans: PortableTextSpan[];
	markDefs: PortableTextMarkDef[];
}

function collectInline(node: Node, activeMarks: string[]): InlineResult {
	const spans: PortableTextSpan[] = [];
	const markDefs: PortableTextMarkDef[] = [];

	for (const child of Array.from(node.childNodes)) {
		if (child.nodeType === 3 /* TEXT_NODE */) {
			const text = child.textContent ?? "";
			if (text.length === 0) continue;
			spans.push({
				_type: "span",
				_key: nextKey(),
				text,
				marks: activeMarks.length > 0 ? [...activeMarks] : undefined,
			});
			continue;
		}

		if (child.nodeType !== 1 /* ELEMENT_NODE */) continue;
		const el = child as unknown as Element;
		const tag = el.tagName.toLowerCase();

		if (tag === "br") {
			spans.push({ _type: "span", _key: nextKey(), text: "\n" });
			continue;
		}

		if (tag === "a") {
			const href = el.getAttribute("href") ?? "";
			const markKey = nextKey();
			markDefs.push({
				_type: "link",
				_key: markKey,
				href,
			} as PortableTextMarkDef);
			const nested = collectInline(el, [...activeMarks, markKey]);
			spans.push(...nested.spans);
			markDefs.push(...nested.markDefs);
			continue;
		}

		const mark = MARK_TAGS[tag];
		if (mark) {
			const nested = collectInline(el, [...activeMarks, mark]);
			spans.push(...nested.spans);
			markDefs.push(...nested.markDefs);
			continue;
		}

		// Unknown inline wrapper (span, sub, sup, etc.) - unwrap, keep text.
		const nested = collectInline(el, activeMarks);
		spans.push(...nested.spans);
		markDefs.push(...nested.markDefs);
	}

	return { spans, markDefs };
}

function makeTextBlock(
	node: Node,
	style: PortableTextTextBlock["style"],
	listItem?: PortableTextTextBlock["listItem"],
	level?: number,
): PortableTextTextBlock | null {
	const { spans, markDefs } = collectInline(node, []);
	if (spans.length === 0) return null;
	return {
		_type: "block",
		_key: nextKey(),
		style,
		...(listItem ? { listItem, level: level ?? 1 } : {}),
		children: spans,
		markDefs: markDefs.length > 0 ? markDefs : undefined,
	};
}

function makeCodeBlock(preEl: Element): PortableTextCodeBlock {
	const codeEl = preEl.querySelector("code");
	const target = codeEl ?? preEl;
	const languageMatch = /language-(\S+)/.exec(target.getAttribute("class") ?? "");
	return {
		_type: "code",
		_key: nextKey(),
		code: target.textContent ?? "",
		language: languageMatch?.[1],
	};
}

function makeImageBlock(imgEl: Element): PortableTextImageBlock | null {
	const src = imgEl.getAttribute("src");
	if (!src) return null;
	return {
		_type: "image",
		_key: nextKey(),
		asset: { _ref: src, url: src },
		alt: imgEl.getAttribute("alt") ?? undefined,
	};
}

function walkBlockLevel(root: Element, blocks: PortableTextBlock[]): void {
	for (const child of Array.from(root.childNodes)) {
		if (child.nodeType === 3 /* TEXT_NODE */) {
			const text = child.textContent ?? "";
			if (text.trim().length === 0) continue;
			blocks.push({
				_type: "block",
				_key: nextKey(),
				style: "normal",
				children: [{ _type: "span", _key: nextKey(), text }],
			});
			continue;
		}

		if (child.nodeType !== 1 /* ELEMENT_NODE */) continue;
		const el = child as unknown as Element;
		const tag = el.tagName.toLowerCase();

		if (tag === "script" || tag === "style") continue;

		if (tag === "hr") {
			const breakBlock: PortableTextBreakBlock = { _type: "break", _key: nextKey() };
			blocks.push(breakBlock);
			continue;
		}

		if (tag === "img") {
			const block = makeImageBlock(el);
			if (block) blocks.push(block);
			continue;
		}

		if (tag === "figure") {
			const img = el.querySelector("img");
			if (img) {
				const block = makeImageBlock(img);
				const caption = el.querySelector("figcaption")?.textContent?.trim();
				if (block) {
					if (caption) block.caption = caption;
					blocks.push(block);
				}
			} else {
				walkBlockLevel(el, blocks);
			}
			continue;
		}

		if (tag in HEADING_STYLE) {
			const block = makeTextBlock(el, HEADING_STYLE[tag]);
			if (block) blocks.push(block);
			continue;
		}

		if (tag === "p") {
			const block = makeTextBlock(el, "normal");
			if (block) blocks.push(block);
			continue;
		}

		if (tag === "blockquote") {
			// Flatten paragraphs inside the blockquote into blockquote-styled blocks.
			const paragraphs = el.querySelectorAll("p");
			if (paragraphs.length > 0) {
				for (const p of Array.from(paragraphs)) {
					const block = makeTextBlock(p, "blockquote");
					if (block) blocks.push(block);
				}
			} else {
				const block = makeTextBlock(el, "blockquote");
				if (block) blocks.push(block);
			}
			continue;
		}

		if (tag === "pre") {
			blocks.push(makeCodeBlock(el));
			continue;
		}

		if (tag === "ul" || tag === "ol") {
			const listId = nextKey();
			const items = Array.from(el.children).filter(
				(li) => li.tagName.toLowerCase() === "li",
			);
			for (const li of items) {
				const { spans, markDefs } = collectInline(li, []);
				if (spans.length === 0) continue;
				blocks.push({
					_type: "block",
					_key: nextKey(),
					style: "normal",
					listItem: tag === "ul" ? "bullet" : "number",
					level: 1,
					listId,
					children: spans,
					markDefs: markDefs.length > 0 ? markDefs : undefined,
				} as PortableTextTextBlock);
			}
			continue;
		}

		// Unknown block-level wrapper (div, section, etc.) - unwrap and recurse.
		walkBlockLevel(el, blocks);
	}
}

/**
 * Converts an HTML fragment into EmDash Portable Text blocks.
 * Unknown tags are stripped, keeping their text content where possible.
 */
export function htmlToPortableText(html: string): PortableTextBlock[] {
	const { document } = parseHTML(`<!doctype html><html><body>${html}</body></html>`);
	const blocks: PortableTextBlock[] = [];
	walkBlockLevel(document.body as unknown as Element, blocks);
	return blocks;
}
