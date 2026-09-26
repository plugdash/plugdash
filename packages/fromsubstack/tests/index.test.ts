import { describe, it, expect, vi } from "vitest";
import { zipSync, strToU8 } from "fflate";
import { createSubstackSource } from "../src/source.ts";
import { parseCsv, parseCsvRows } from "../src/csv.ts";
import type { ImportContext, NormalizedItem, SourceInput } from "emdash";
import type {
	PortableTextTextBlock,
	PortableTextImageBlock,
	PortableTextCodeBlock,
} from "emdash";

// ── Fixture ──

const CSV_HEADER =
	"post_id,post_date,is_published,email_sent_at,type,audience,title,subtitle,url";

const CSV_ROWS = [
	`101,2024-01-05T10:00:00Z,true,2024-01-05T10:05:00Z,newsletter,everyone,"Hello, World",The very first one,https://acme.substack.com/p/hello-world-jan`,
	`102,2024-02-11T09:00:00Z,true,,newsletter,only_paid,Behind the paywall,,https://acme.substack.com/p/behind-the-paywall`,
	`103,2024-03-02T12:00:00Z,false,,newsletter,everyone,Still cooking,,https://acme.substack.com/p/still-cooking`,
	`104,2024-03-20T08:00:00Z,true,,podcast,everyone,Episode one,,https://acme.substack.com/p/episode-one`,
	`105,2024-04-01T08:00:00Z,true,,newsletter,everyone,Lost body,,https://acme.substack.com/p/lost-body`,
	`106,2024-04-15T08:00:00Z,true,,newsletter,everyone,Nothing here,,https://acme.substack.com/p/nothing-here`,
	`107,2024-05-01T08:00:00Z,true,,newsletter,founding,"Numbers, letters and ""quotes""",,https://acme.substack.com/p/numbers-letters`,
];

const HELLO_HTML = `
	<h2>A heading</h2>
	<p>Plain text with <strong>bold</strong> and <em>italic</em> and
	<a href="https://example.com">a link</a>.</p>
	<img src="https://substackcdn.com/image/one.png" alt="One">
	<custom-tag>survives as text</custom-tag>
`;

const PAYWALL_HTML = `
	<blockquote><p>Quoted wisdom</p></blockquote>
	<pre><code class="language-ts">const x = 1;</code></pre>
	<img src="https://substackcdn.com/image/two.jpg" alt="Two">
`;

const FIXTURE_FILES: Record<string, string> = {
	"posts.csv": [CSV_HEADER, ...CSV_ROWS].join("\n"),
	"posts/101.hello-world-jan.html": HELLO_HTML,
	"posts/102.behind-the-paywall.html": PAYWALL_HTML,
	"posts/103.still-cooking.html": "<p>Draft body</p>",
	"posts/104.episode-one.html": "<p>Show notes</p>",
	"posts/106.nothing-here.html": "   ",
	"posts/107.numbers-letters.html": '<p>Body</p><img src="attachments/local.png" alt="Local">',
	"attachments/local.png": "fake-png-bytes",
};

function makeInput(files: Record<string, string> = FIXTURE_FILES): SourceInput {
	const zipped = zipSync(
		Object.fromEntries(Object.entries(files).map(([path, body]) => [path, strToU8(body)])),
	);
	return {
		type: "file",
		file: new File([zipped.buffer as ArrayBuffer], "substack.zip", {
			type: "application/zip",
		}),
	};
}

const EMPTY_CONTEXT: ImportContext = {};

async function collect(
	generator: AsyncGenerator<NormalizedItem>,
): Promise<NormalizedItem[]> {
	const items: NormalizedItem[] = [];
	for await (const item of generator) items.push(item);
	return items;
}

function makeSource(overrides: Parameters<typeof createSubstackSource>[0] = {}) {
	const warnings: string[] = [];
	const source = createSubstackSource({ onWarn: (m) => warnings.push(m), ...overrides });
	return { source, warnings };
}

// ── CSV parsing ──

describe("parseCsv", () => {
	it("keys rows by the header row", () => {
		const rows = parseCsv("a,b\n1,2\n3,4");
		expect(rows).toEqual([
			{ a: "1", b: "2" },
			{ a: "3", b: "4" },
		]);
	});

	it("keeps commas inside quoted fields", () => {
		const rows = parseCsv('title,type\n"Hello, World",post');
		expect(rows[0]?.title).toBe("Hello, World");
		expect(rows[0]?.type).toBe("post");
	});

	it("unescapes doubled quotes", () => {
		const rows = parseCsv('title\n"She said ""hi"""');
		expect(rows[0]?.title).toBe('She said "hi"');
	});

	it("keeps newlines inside quoted fields", () => {
		const rows = parseCsv('title,x\n"line one\nline two",9');
		expect(rows[0]?.title).toBe("line one\nline two");
		expect(rows[0]?.x).toBe("9");
	});

	it("handles CRLF line endings and a BOM", () => {
		const rows = parseCsv("﻿a,b\r\n1,2\r\n");
		expect(rows).toEqual([{ a: "1", b: "2" }]);
	});

	it("fills missing trailing columns with empty strings", () => {
		const rows = parseCsv("a,b,c\n1,2");
		expect(rows[0]).toEqual({ a: "1", b: "2", c: "" });
	});

	it("drops blank lines and returns nothing for empty input", () => {
		expect(parseCsv("a,b\n\n1,2\n\n")).toEqual([{ a: "1", b: "2" }]);
		expect(parseCsv("")).toEqual([]);
	});

	it("exposes raw rows for callers that want them", () => {
		expect(parseCsvRows("a,b\n1,2")).toEqual([
			["a", "b"],
			["1", "2"],
		]);
	});
});

// ── ZIP handling ──

describe("export reading", () => {
	it("rejects a non-file input", async () => {
		const { source } = makeSource();
		await expect(
			source.analyze({ type: "url", url: "https://acme.substack.com" }, EMPTY_CONTEXT),
		).rejects.toThrow(/export ZIP file/i);
	});

	it("rejects a file that is not a ZIP", async () => {
		const { source } = makeSource();
		const input: SourceInput = {
			type: "file",
			file: new File(["definitely not a zip"], "nope.zip"),
		};
		await expect(source.analyze(input, EMPTY_CONTEXT)).rejects.toThrow(
			/not a valid ZIP archive/i,
		);
	});

	it("rejects a ZIP with no posts.csv", async () => {
		const { source } = makeSource();
		await expect(
			source.analyze(makeInput({ "readme.txt": "hi" }), EMPTY_CONTEXT),
		).rejects.toThrow(/posts\.csv/i);
	});

	it("finds posts.csv even when the export nests it in a folder", async () => {
		const nested = Object.fromEntries(
			Object.entries(FIXTURE_FILES).map(([path, body]) => [`acme-export/${path}`, body]),
		);
		const { source } = makeSource();
		const analysis = await source.analyze(makeInput(nested), EMPTY_CONTEXT);
		expect(analysis.postTypes[0]?.count).toBe(5);
	});
});

// ── analyze ──

describe("analyze", () => {
	it("reports the importable posts and the site behind them", async () => {
		const { source, warnings } = makeSource();
		const analysis = await source.analyze(makeInput(), EMPTY_CONTEXT);

		expect(analysis.sourceId).toBe("substack");
		expect(analysis.site).toEqual({
			title: "acme.substack.com",
			url: "https://acme.substack.com",
		});
		// 7 CSV rows, minus the podcast and the one with no HTML file.
		expect(analysis.postTypes[0]?.count).toBe(5);
		expect(analysis.authors[0]?.postCount).toBe(5);
		expect(warnings.join(" ")).toMatch(/Episode one/);
		expect(warnings.join(" ")).toMatch(/Lost body/);
	});

	it("collects every distinct image as an attachment", async () => {
		const { source } = makeSource();
		const analysis = await source.analyze(makeInput(), EMPTY_CONTEXT);
		expect(analysis.attachments.count).toBe(3);
		expect(analysis.attachments.items.map((a) => a.filename).sort()).toEqual([
			"local.png",
			"one.png",
			"two.jpg",
		]);
		expect(analysis.attachments.items.find((a) => a.filename === "two.jpg")?.mimeType).toBe(
			"image/jpeg",
		);
	});

	it("reports no attachments when importImages is off", async () => {
		const { source } = makeSource({ importImages: false });
		const analysis = await source.analyze(makeInput(), EMPTY_CONTEXT);
		expect(analysis.attachments.count).toBe(0);
	});

	it("says the collection will be created when it does not exist", async () => {
		const { source } = makeSource();
		const analysis = await source.analyze(makeInput(), {
			getExistingCollections: async () => new Map(),
		});
		const status = analysis.postTypes[0]!.schemaStatus;
		expect(status.exists).toBe(false);
		expect(status.canImport).toBe(true);
		expect(status.fieldStatus.body?.status).toBe("missing");
	});

	it("blocks the import when an existing field has the wrong type", async () => {
		const { source } = makeSource();
		const analysis = await source.analyze(makeInput(), {
			getExistingCollections: async () =>
				new Map([
					[
						"posts",
						{
							slug: "posts",
							fields: new Map([
								["title", { type: "string" }],
								["body", { type: "string" }],
							]),
						},
					],
				]),
		});
		const status = analysis.postTypes[0]!.schemaStatus;
		expect(status.exists).toBe(true);
		expect(status.canImport).toBe(false);
		expect(status.fieldStatus.title?.status).toBe("compatible");
		expect(status.fieldStatus.body).toEqual({
			status: "type_mismatch",
			existingType: "string",
			requiredType: "portableText",
		});
		expect(status.reason).toMatch(/needs portableText/);
	});

	it("targets the configured collection", async () => {
		const { source } = makeSource({ targetCollection: "newsletter" });
		const analysis = await source.analyze(makeInput(), EMPTY_CONTEXT);
		expect(analysis.postTypes[0]?.suggestedCollection).toBe("newsletter");
	});
});

// ── fetchContent ──

describe("fetchContent", () => {
	const allTypes = { postTypes: ["post"] };

	it("yields published posts and holds back drafts", async () => {
		const { source } = makeSource();
		const items = await collect(source.fetchContent(makeInput(), allTypes));
		expect(items.map((i) => i.slug)).toEqual([
			"hello-world-jan",
			"behind-the-paywall",
			"nothing-here",
			"numbers-letters",
		]);
	});

	it("includes drafts when asked", async () => {
		const { source } = makeSource();
		const items = await collect(
			source.fetchContent(makeInput(), { ...allTypes, includeDrafts: true }),
		);
		expect(items).toHaveLength(5);
		expect(items.find((i) => i.slug === "still-cooking")?.status).toBe("draft");
	});

	it("respects the limit", async () => {
		const { source } = makeSource();
		const items = await collect(source.fetchContent(makeInput(), { ...allTypes, limit: 2 }));
		expect(items).toHaveLength(2);
	});

	it("yields nothing when the host asked for other post types", async () => {
		const { source } = makeSource();
		const items = await collect(source.fetchContent(makeInput(), { postTypes: ["page"] }));
		expect(items).toEqual([]);
	});

	it("imports as draft by default and as published on request", async () => {
		const { source: drafting } = makeSource();
		const drafts = await collect(drafting.fetchContent(makeInput(), allTypes));
		expect(drafts.every((i) => i.status === "draft")).toBe(true);

		const { source: publishing } = makeSource({ status: "published" });
		const published = await collect(publishing.fetchContent(makeInput(), allTypes));
		expect(published.every((i) => i.status === "publish")).toBe(true);
	});

	it("keeps an unpublished post as a draft even when status is published", async () => {
		const { source } = makeSource({ status: "published" });
		const items = await collect(
			source.fetchContent(makeInput(), { ...allTypes, includeDrafts: true }),
		);
		expect(items.find((i) => i.slug === "still-cooking")?.status).toBe("draft");
	});

	it("keeps Substack slugs, or re-slugifies titles when told to", async () => {
		const { source: keeping } = makeSource();
		const kept = await collect(keeping.fetchContent(makeInput(), allTypes));
		expect(kept[0]?.slug).toBe("hello-world-jan");

		const { source: reslugging } = makeSource({ preserveSlugs: false });
		const reslugged = await collect(reslugging.fetchContent(makeInput(), allTypes));
		expect(reslugged[0]?.slug).toBe("hello-world");
	});

	it("maps title, subtitle, date and paid audience onto the item", async () => {
		const { source } = makeSource();
		const items = await collect(source.fetchContent(makeInput(), allTypes));
		const hello = items[0]!;

		expect(hello.sourceId).toBe("101");
		expect(hello.postType).toBe("post");
		expect(hello.title).toBe("Hello, World");
		expect(hello.excerpt).toBe("The very first one");
		expect(hello.date.toISOString()).toBe("2024-01-05T10:00:00.000Z");
		expect(hello.meta).toMatchObject({
			substackId: "101",
			substackUrl: "https://acme.substack.com/p/hello-world-jan",
			substackAudience: "everyone",
			substackPaid: false,
		});

		const paid = items.find((i) => i.slug === "behind-the-paywall")!;
		expect(paid.meta).toMatchObject({ substackAudience: "only_paid", substackPaid: true });
	});

	it("uses the first body image as the featured image", async () => {
		const { source } = makeSource();
		const items = await collect(source.fetchContent(makeInput(), allTypes));
		expect(items[0]?.featuredImage).toBe("https://substackcdn.com/image/one.png");
		expect(items.find((i) => i.slug === "nothing-here")?.featuredImage).toBeUndefined();
	});

	it("converts the HTML body into Portable Text", async () => {
		const { source } = makeSource();
		const items = await collect(source.fetchContent(makeInput(), allTypes));
		const blocks = items[0]!.content as unknown as Array<
			PortableTextTextBlock | PortableTextImageBlock
		>;

		const heading = blocks.find((b) => b._type === "block" && b.style === "h2");
		expect(heading).toBeDefined();

		const paragraph = blocks.find(
			(b) => b._type === "block" && b.style === "normal",
		) as PortableTextTextBlock;
		expect(paragraph.children.find((s) => s.text === "bold")?.marks).toEqual(["strong"]);
		expect(paragraph.children.find((s) => s.text === "italic")?.marks).toEqual(["em"]);
		const linked = paragraph.children.find((s) => s.text === "a link")!;
		expect(
			paragraph.markDefs?.find((m) => m._key === linked.marks?.[0]),
		).toMatchObject({ _type: "link", href: "https://example.com" });

		const image = blocks.find((b) => b._type === "image") as PortableTextImageBlock;
		expect(image.asset.url).toBe("https://substackcdn.com/image/one.png");
		expect(image.alt).toBe("One");

		// Unknown tags lose the tag but keep their text.
		const texts = blocks.flatMap((b) =>
			b._type === "block" ? b.children.map((s) => s.text) : [],
		);
		expect(texts.join(" ")).toContain("survives as text");
	});

	it("converts blockquotes and fenced code", async () => {
		const { source } = makeSource();
		const items = await collect(source.fetchContent(makeInput(), allTypes));
		const blocks = items.find((i) => i.slug === "behind-the-paywall")!.content as unknown as Array<
			PortableTextTextBlock | PortableTextCodeBlock
		>;

		expect(blocks.some((b) => b._type === "block" && b.style === "blockquote")).toBe(true);
		const code = blocks.find((b) => b._type === "code") as PortableTextCodeBlock;
		expect(code.code).toBe("const x = 1;");
		expect(code.language).toBe("ts");
	});

	it("imports a post with an empty body and warns about it", async () => {
		const { source, warnings } = makeSource();
		const items = await collect(source.fetchContent(makeInput(), allTypes));
		const empty = items.find((i) => i.slug === "nothing-here")!;
		expect(empty.content).toEqual([]);
		expect(warnings.join(" ")).toMatch(/Nothing here.*empty body/);
	});

	it("skips a duplicate slug rather than importing it twice", async () => {
		const duped = {
			...FIXTURE_FILES,
			"posts.csv": [
				CSV_HEADER,
				CSV_ROWS[0]!,
				`108,2024-06-01T08:00:00Z,true,,newsletter,everyone,Same slug again,,https://acme.substack.com/p/hello-world-jan`,
			].join("\n"),
			"posts/108.hello-world-jan.html": "<p>Copy</p>",
		};
		const { source, warnings } = makeSource();
		const items = await collect(source.fetchContent(makeInput(duped), allTypes));
		expect(items).toHaveLength(1);
		expect(warnings.join(" ")).toMatch(/appears more than once/);
	});
});

// ── fetchMedia ──

describe("fetchMedia", () => {
	it("pulls an attachment straight out of the ZIP", async () => {
		const { source } = makeSource();
		const input = makeInput();
		const blob = await source.fetchMedia!("attachments/local.png", input);
		expect(blob.type).toBe("image/png");
		expect(await blob.text()).toBe("fake-png-bytes");
	});

	it("finds an attachment by filename when the path does not match", async () => {
		const { source } = makeSource();
		const blob = await source.fetchMedia!("local.png", makeInput());
		expect(await blob.text()).toBe("fake-png-bytes");
	});

	it("throws when the attachment is not in the export", async () => {
		const { source } = makeSource();
		await expect(source.fetchMedia!("attachments/gone.png", makeInput())).rejects.toThrow(
			/Could not find/i,
		);
	});

	it("downloads remote images over HTTP", async () => {
		const fetchSpy = vi
			.fn()
			.mockResolvedValue(new Response("remote-bytes", { status: 200 }));
		vi.stubGlobal("fetch", fetchSpy);
		try {
			const { source } = makeSource();
			const blob = await source.fetchMedia!(
				"https://substackcdn.com/image/one.png",
				makeInput(),
			);
			expect(await blob.text()).toBe("remote-bytes");
			expect(fetchSpy).toHaveBeenCalledWith("https://substackcdn.com/image/one.png");
		} finally {
			vi.unstubAllGlobals();
		}
	});

	it("reports a failed download instead of returning an empty blob", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(new Response("nope", { status: 404, statusText: "Not Found" })),
		);
		try {
			const { source } = makeSource();
			await expect(
				source.fetchMedia!("https://substackcdn.com/image/gone.png", makeInput()),
			).rejects.toThrow(/404/);
		} finally {
			vi.unstubAllGlobals();
		}
	});
});

// ── Source descriptor ──

describe("source descriptor", () => {
	it("declares itself as a file-based source", () => {
		const { source } = makeSource();
		expect(source.id).toBe("substack");
		expect(source.requiresFile).toBe(true);
		expect(source.canProbe).toBeUndefined();
	});
});
