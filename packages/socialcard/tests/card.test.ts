import { describe, it, expect } from "vitest";
import {
	renderCard,
	resolveConfig,
	truncateTitle,
	wrapText,
	formatDate,
	buildByline,
	cardFilename,
	escapeXml,
	MAX_TITLE_LENGTH,
	CARD_MIME,
} from "../src/card.ts";
import type { CardTemplate } from "../src/card.ts";

const TEMPLATES: CardTemplate[] = ["default", "minimal", "bold"];

// ── Test helpers ──

/** Visible text of the card, with entities decoded and tags stripped. */
function cardText(svg: string): string {
	return svg
		.replace(/<[^>]+>/g, " ")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&apos;/g, "'")
		.replace(/&amp;/g, "&")
		.replace(/\s+/g, " ")
		.trim();
}

/**
 * Returns a list of problems with the markup. Empty means every element is
 * closed in order and no ampersand was left unescaped - the two ways a
 * hand-built SVG string actually goes wrong.
 */
function wellFormedProblems(svg: string): string[] {
	const problems: string[] = [];
	const stack: string[] = [];
	const tag = /<(\/?)([a-zA-Z][\w-]*)([^>]*?)(\/?)>/g;
	let match: RegExpExecArray | null;
	while ((match = tag.exec(svg)) !== null) {
		const closing = match[1] === "/";
		const name = match[2]!;
		const selfClosing = match[4] === "/";
		if (selfClosing) continue;
		if (closing) {
			const open = stack.pop();
			if (open !== name) problems.push(`</${name}> closes <${open ?? "nothing"}>`);
		} else {
			stack.push(name);
		}
	}
	if (stack.length > 0) problems.push(`unclosed: ${stack.join(", ")}`);
	const loose = svg.match(/&(?!(?:amp|lt|gt|quot|apos|#\d+);)/g);
	if (loose) problems.push(`unescaped ampersand x${loose.length}`);
	return problems;
}

describe("resolveConfig", () => {
	it("applies the documented defaults", () => {
		const c = resolveConfig();
		expect(c.template).toBe("default");
		expect(c.width).toBe(1200);
		expect(c.height).toBe(630);
		expect(c.background).toBe("#0f172a");
		expect(c.foreground).toBe("#f8fafc");
		expect(c.logo).toBeNull();
	});

	it("honours supplied values", () => {
		const c = resolveConfig({
			template: "bold",
			width: 800,
			height: 400,
			background: "#000000",
			foreground: "#ffffff",
			logo: "https://example.com/logo.png",
			fonts: { title: "Georgia, serif", body: "Verdana, sans-serif" },
		});
		expect(c).toMatchObject({
			template: "bold",
			width: 800,
			height: 400,
			background: "#000000",
			foreground: "#ffffff",
			logo: "https://example.com/logo.png",
			titleFont: "Georgia, serif",
			bodyFont: "Verdana, sans-serif",
		});
	});

	it("falls back when given unusable values", () => {
		const c = resolveConfig({
			template: "fancy" as CardTemplate,
			width: 0,
			height: Number.NaN,
			background: "   ",
		});
		expect(c.template).toBe("default");
		expect(c.width).toBe(1200);
		expect(c.height).toBe(630);
		expect(c.background).toBe("#0f172a");
	});
});

describe("truncateTitle", () => {
	it("leaves a short title alone", () => {
		expect(truncateTitle("Short and sweet")).toBe("Short and sweet");
	});

	it("collapses runs of whitespace", () => {
		expect(truncateTitle("  spaced \n  out  ")).toBe("spaced out");
	});

	it("truncates at the limit with an ellipsis", () => {
		const long = "a".repeat(120);
		const result = truncateTitle(long);
		expect(result).toHaveLength(MAX_TITLE_LENGTH);
		expect(result.endsWith("…")).toBe(true);
	});
});

describe("wrapText", () => {
	it("breaks on the last word that fits", () => {
		expect(wrapText("one two three four", 9)).toEqual(["one two", "three", "four"]);
	});

	it("gives an oversized word its own line", () => {
		expect(wrapText("hi supercalifragilistic go", 6)).toEqual([
			"hi",
			"supercalifragilistic",
			"go",
		]);
	});

	it("returns an empty list for empty input", () => {
		expect(wrapText("", 20)).toEqual([]);
	});
});

describe("formatDate and buildByline", () => {
	it("formats an ISO timestamp in UTC", () => {
		expect(formatDate("2026-01-15T23:30:00Z")).toBe("January 15, 2026");
	});

	it("returns null for a missing or unparseable date", () => {
		expect(formatDate(null)).toBeNull();
		expect(formatDate("not a date")).toBeNull();
	});

	it("joins author and date", () => {
		expect(
			buildByline({
				title: "t",
				author: "Ada Lovelace",
				publishedAt: "2026-01-15T00:00:00Z",
			}),
		).toBe("Ada Lovelace · January 15, 2026");
	});

	it("keeps whichever half is present", () => {
		expect(buildByline({ title: "t", author: "Ada" })).toBe("Ada");
		expect(buildByline({ title: "t", publishedAt: "2026-01-15T00:00:00Z" })).toBe(
			"January 15, 2026",
		);
	});

	it("returns null when neither is present", () => {
		expect(buildByline({ title: "t" })).toBeNull();
		expect(buildByline({ title: "t", author: "   " })).toBeNull();
	});
});

describe("template rendering", () => {
	const input = {
		title: "Shipping a plugin in an afternoon",
		author: "Ada Lovelace",
		publishedAt: "2026-01-15T00:00:00Z",
	};

	it("default template renders the title", () => {
		const svg = renderCard(input);
		expect(cardText(svg)).toContain("Shipping a plugin in an afternoon");
	});

	it("default template truncates a title over 80 chars", () => {
		const long = `${"Lorem ipsum dolor sit amet ".repeat(6)}end`;
		const svg = renderCard({ ...input, title: long });
		const text = cardText(svg);
		expect(text).toContain("…");
		expect(text).not.toContain("end");
		// Title text only, byline dropped, so this is the rendered title length.
		const titleOnly = cardText(renderCard({ title: long }));
		expect(titleOnly).toHaveLength(MAX_TITLE_LENGTH);
	});

	it("default template omits the author line when author is undefined", () => {
		const svg = renderCard({ title: input.title });
		expect(cardText(svg)).toBe(input.title);
		expect(svg).not.toContain("·");
	});

	it("default template still shows the date when only the author is missing", () => {
		const svg = renderCard({ title: input.title, publishedAt: input.publishedAt });
		expect(cardText(svg)).toContain("January 15, 2026");
		expect(cardText(svg)).not.toContain("Ada Lovelace");
	});

	it("default template paints a gradient over the background colour", () => {
		const svg = renderCard(input, { background: "#123456" });
		expect(svg).toContain("<linearGradient id=\"sc-bg\"");
		expect(svg).toContain('fill="#123456"');
		expect(svg).toContain('fill="url(#sc-bg)"');
	});

	it("minimal template renders the title only", () => {
		const svg = renderCard(input, { template: "minimal" });
		expect(cardText(svg)).toBe(input.title);
		expect(svg).not.toContain("Ada Lovelace");
		expect(svg).not.toContain("linearGradient");
	});

	it("minimal template inverts the palette so defaults read as dark on white", () => {
		const svg = renderCard(input, { template: "minimal" });
		expect(svg).toContain('<rect width="1200" height="630" fill="#f8fafc"/>');
		expect(svg).toContain('fill="#0f172a"');
	});

	it("bold template renders a colour block and offsets the text past it", () => {
		const svg = renderCard(input, { template: "bold" });
		expect(svg).toContain(
			'<rect x="0" y="0" width="120" height="630" fill="#f8fafc"/>',
		);
		// Text starts after the 120px block plus the 80px gutter.
		expect(svg).toContain('<tspan x="200"');
		expect(cardText(svg)).toContain("Ada Lovelace");
	});

	it("every template produces well-formed markup with no render errors", () => {
		for (const template of TEMPLATES) {
			for (const value of [input, { title: "" }, { title: "x".repeat(200) }]) {
				const svg = renderCard(value, { template, logo: "https://e.com/l.png" });
				expect(wellFormedProblems(svg), `${template}`).toEqual([]);
				expect(svg.startsWith("<svg ")).toBe(true);
				expect(svg.endsWith("</svg>")).toBe(true);
			}
		}
	});

	it("escapes XML-significant characters in user content", () => {
		const svg = renderCard({
			title: '<script>alert("x")</script> & more',
			author: "A & B",
			publishedAt: "2026-01-15T00:00:00Z",
		});
		expect(svg).not.toContain("<script>");
		expect(svg).toContain("&lt;script&gt;");
		expect(wellFormedProblems(svg)).toEqual([]);
		expect(cardText(svg)).toContain("A & B");
	});

	it("honours custom dimensions", () => {
		const svg = renderCard(input, { width: 800, height: 418 });
		expect(svg).toContain('width="800"');
		expect(svg).toContain('height="418"');
		expect(svg).toContain('viewBox="0 0 800 418"');
	});

	it("includes the logo only when one is configured", () => {
		expect(renderCard(input)).not.toContain("<image");
		expect(renderCard(input, { logo: "https://e.com/l.png" })).toContain(
			'<image href="https://e.com/l.png"',
		);
	});

	it("carries the title into the accessible label", () => {
		const svg = renderCard(input);
		expect(svg).toContain(`aria-label="${escapeXml(input.title)} - Ada Lovelace`);
	});
});

describe("cardFilename", () => {
	it("is stable for a given content id so republishing overwrites", () => {
		expect(cardFilename("content-001")).toBe("og-content-001.svg");
		expect(cardFilename("content-001")).toBe(cardFilename("content-001"));
	});

	it("strips characters that are not filename-safe", () => {
		expect(cardFilename("a/b c:d")).toBe("og-a-b-c-d.svg");
	});

	it("matches the declared media type", () => {
		expect(CARD_MIME).toBe("image/svg+xml");
		expect(cardFilename("x").endsWith(".svg")).toBe(true);
	});
});
