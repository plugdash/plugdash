import { describe, it, expect, beforeEach } from "vitest";
import { htmlToPortableText, resetKeyCounter } from "../src/index.ts";
import type {
	PortableTextTextBlock,
	PortableTextImageBlock,
	PortableTextCodeBlock,
} from "emdash";

describe("htmlToPortableText", () => {
	beforeEach(() => {
		resetKeyCounter();
	});

	it("converts headings to the matching block style", () => {
		const blocks = htmlToPortableText("<h2>Title</h2><h3>Subtitle</h3>");
		expect(blocks).toHaveLength(2);
		expect((blocks[0] as PortableTextTextBlock).style).toBe("h2");
		expect((blocks[0] as PortableTextTextBlock).children[0]?.text).toBe(
			"Title",
		);
		expect((blocks[1] as PortableTextTextBlock).style).toBe("h3");
	});

	it("converts paragraphs to normal-style blocks", () => {
		const blocks = htmlToPortableText("<p>Hello world</p>");
		expect(blocks).toHaveLength(1);
		const block = blocks[0] as PortableTextTextBlock;
		expect(block._type).toBe("block");
		expect(block.style).toBe("normal");
		expect(block.children[0]?.text).toBe("Hello world");
	});

	it("marks strong and em text", () => {
		const blocks = htmlToPortableText(
			"<p>plain <strong>bold</strong> and <em>italic</em></p>",
		);
		const block = blocks[0] as PortableTextTextBlock;
		const bold = block.children.find((s) => s.text === "bold");
		const italic = block.children.find((s) => s.text === "italic");
		expect(bold?.marks).toEqual(["strong"]);
		expect(italic?.marks).toEqual(["em"]);
	});

	it("converts links into a link mark def", () => {
		const blocks = htmlToPortableText('<p><a href="/foo">link text</a></p>');
		const block = blocks[0] as PortableTextTextBlock;
		const span = block.children[0]!;
		expect(span.text).toBe("link text");
		expect(span.marks).toHaveLength(1);
		const markDef = block.markDefs?.find((m) => m._key === span.marks![0]);
		expect(markDef).toEqual(
			expect.objectContaining({ _type: "link", href: "/foo" }),
		);
	});

	it("converts img tags into image blocks", () => {
		const blocks = htmlToPortableText('<img src="https://x.com/a.png" alt="A">');
		const block = blocks[0] as PortableTextImageBlock;
		expect(block._type).toBe("image");
		expect(block.asset._ref).toBe("https://x.com/a.png");
		expect(block.alt).toBe("A");
	});

	it("converts figure+figcaption into a captioned image block", () => {
		const blocks = htmlToPortableText(
			'<figure><img src="https://x.com/a.png"><figcaption>Caption text</figcaption></figure>',
		);
		const block = blocks[0] as PortableTextImageBlock;
		expect(block.caption).toBe("Caption text");
	});

	it("converts blockquote paragraphs into blockquote-style blocks", () => {
		const blocks = htmlToPortableText("<blockquote><p>Quoted</p></blockquote>");
		expect((blocks[0] as PortableTextTextBlock).style).toBe("blockquote");
	});

	it("converts pre/code into a code block with detected language", () => {
		const blocks = htmlToPortableText(
			'<pre><code class="language-js">const x = 1;</code></pre>',
		);
		const block = blocks[0] as PortableTextCodeBlock;
		expect(block._type).toBe("code");
		expect(block.code).toBe("const x = 1;");
		expect(block.language).toBe("js");
	});

	it("converts hr into a break block", () => {
		const blocks = htmlToPortableText("<p>a</p><hr><p>b</p>");
		expect(blocks[1]?._type).toBe("break");
	});

	it("converts unordered and ordered lists into list-item blocks", () => {
		const blocks = htmlToPortableText("<ul><li>one</li><li>two</li></ul>");
		expect(blocks).toHaveLength(2);
		const first = blocks[0] as PortableTextTextBlock;
		expect(first.listItem).toBe("bullet");
		expect(first.children[0]?.text).toBe("one");
		expect(first.listId).toBe((blocks[1] as PortableTextTextBlock).listId);
	});

	it("strips unknown tags but keeps their text content", () => {
		const blocks = htmlToPortableText("<div><p>kept</p><custom-tag>also kept</custom-tag></div>");
		const texts = blocks
			.map((b) => (b as PortableTextTextBlock).children?.[0]?.text)
			.filter(Boolean);
		expect(texts).toContain("kept");
		expect(texts).toContain("also kept");
	});

	it("skips script and style tags entirely", () => {
		const blocks = htmlToPortableText(
			"<p>visible</p><script>evil()</script><style>.x{}</style>",
		);
		expect(blocks).toHaveLength(1);
		expect((blocks[0] as PortableTextTextBlock).children[0]?.text).toBe(
			"visible",
		);
	});

	it("returns an empty array for empty input", () => {
		expect(htmlToPortableText("")).toEqual([]);
	});

	it("ignores whitespace-only top-level text nodes", () => {
		const blocks = htmlToPortableText("<p>a</p>\n   \n<p>b</p>");
		expect(blocks).toHaveLength(2);
	});
});
