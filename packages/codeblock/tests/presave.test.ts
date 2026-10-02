import { describe, it, expect, vi } from "vitest";
import { makeContext } from "@plugdash/testing";
import { createPlugin, preHighlight, MAX_STORED_HTML } from "../src/index.ts";
import { highlightCode, highlighterBuilds } from "../src/highlight.ts";
import { highlightKey, resolveOptions, type StoredHighlight } from "../src/key.ts";

const SLOW = 30_000;

const code = (fields: { code: string; language: string; pdHighlight?: unknown }) => ({
	_type: "code",
	_key: "c1",
	...fields,
});
const para = { _type: "block", _key: "p1", children: [{ _type: "span", text: "hi" }] };

function stored(data: Record<string, unknown> | undefined, field = "content", index = 1) {
	return (data![field] as Record<string, unknown>[])[index]!.pdHighlight as
		| StoredHighlight
		| undefined;
}

describe("package import", () => {
	it("does not load shiki", async () => {
		vi.resetModules();
		let loaded = false;
		vi.doMock("shiki", () => {
			loaded = true;
			return {};
		});
		await import("../src/index.ts");
		await import("../src/key.ts");
		expect(loaded).toBe(false);
		vi.doUnmock("shiki");
		vi.resetModules();
	});
});

describe("highlightKey", () => {
	it("is 8 hex chars and stable", () => {
		const options = resolveOptions({});
		const key = highlightKey({ code: "x", language: "ts" }, options);
		expect(key).toMatch(/^[0-9a-f]{8}$/);
		expect(highlightKey({ code: "x", language: "ts" }, options)).toBe(key);
	});

	it("changes with code, language, theme, lightTheme and lineNumbers", () => {
		const base = highlightKey({ code: "x", language: "ts" }, resolveOptions({}));
		const variants = [
			highlightKey({ code: "y", language: "ts" }, resolveOptions({})),
			highlightKey({ code: "x", language: "js" }, resolveOptions({})),
			highlightKey({ code: "x", language: "ts" }, resolveOptions({ theme: "nord" })),
			highlightKey({ code: "x", language: "ts" }, resolveOptions({ lightTheme: "min-light" })),
			highlightKey({ code: "x", language: "ts" }, resolveOptions({ lineNumbers: true })),
		];
		for (const key of variants) expect(key).not.toBe(base);
	});
});

describe("preHighlight (content:beforeSave)", () => {
	it(
		"stores html and theme colours on each code node, keyed the same way the component checks",
		async () => {
			const config = { theme: "nord" };
			const node = code({ code: "const a = 1;", language: "ts" });
			const out = await preHighlight({ title: "T", content: [para, node] }, config);
			const hl = stored(out)!;
			// The component computes exactly this from the node and site config.
			expect(hl.key).toBe(highlightKey(node, resolveOptions(config)));
			expect(hl.html).toBe(await highlightCode("const a = 1;", "ts", resolveOptions(config)));
			expect(hl.bg).toMatch(/^#/);
			expect(out!.title).toBe("T");
			expect((out!.content as unknown[])[0]).toBe(para);
		},
		SLOW,
	);

	it("leaves a node alone when its stored key already matches", async () => {
		const node = code({ code: "x", language: "ts" });
		const key = highlightKey(node, resolveOptions({}));
		const pdHighlight = { key, html: "<pre>stored</pre>", bg: "#000", fg: "#fff" };
		const out = await preHighlight({ content: [para, { ...node, pdHighlight }] }, {});
		expect(stored(out)).toEqual(pdHighlight);
	});

	it(
		"re-highlights when the theme changes",
		async () => {
			const node = code({ code: "let b = 2;", language: "ts" });
			const first = stored(await preHighlight({ content: [para, node] }, {}))!;
			const again = await preHighlight(
				{ content: [para, { ...node, pdHighlight: first }] },
				{ theme: "nord" },
			);
			const second = stored(again)!;
			expect(second.key).not.toBe(first.key);
			expect(second.html).not.toBe(first.html);
		},
		SLOW,
	);

	it(
		"keeps the output escaped",
		async () => {
			const node = code({ code: "</code><script>alert(1)</script>", language: "html" });
			const { html } = stored(await preHighlight({ content: [para, node] }, {}))!;
			expect(html).not.toContain("<script>");
			expect(html).toContain("&#x3C;");
		},
		SLOW,
	);

	it(
		"does not store html over the size cap, and drops a stale copy",
		async () => {
			const big = Array.from({ length: 3000 }, (_, i) => `const v${i} = "${"x".repeat(20)}";`).join(
				"\n",
			);
			const html = await highlightCode(big, "ts", resolveOptions({}));
			expect(html.length).toBeGreaterThan(MAX_STORED_HTML);
			const stale = { key: "00000000", html: "<pre>old</pre>", bg: "#000", fg: "#fff" };
			const out = await preHighlight(
				{ content: [para, code({ code: big, language: "ts", pdHighlight: stale })] },
				{},
			);
			expect(stored(out)).toBeUndefined();
		},
		SLOW,
	);

	it("finds code nodes in any array field", async () => {
		const node = code({ code: "x", language: "ts" });
		const key = highlightKey(node, resolveOptions({}));
		const out = await preHighlight({ body: [{ ...node, pdHighlight: { key: "stale" } }] }, {});
		expect(stored(out, "body", 0)!.key).toBe(key);
	});

	it("returns undefined when there are no code nodes (autosaves of other fields)", async () => {
		expect(await preHighlight({ excerpt: "x" }, {})).toBeUndefined();
		expect(await preHighlight({ content: [para] }, {})).toBeUndefined();
	});
});

describe("content:beforeSave handler", () => {
	it("never throws: logs a warning and keeps the content unchanged", async () => {
		const ctx = makeContext();
		const handler = createPlugin().hooks["content:beforeSave"]!.handler;
		// biome-ignore lint: deliberately malformed event
		const result = await handler(
			{ content: null, collection: "posts", isNew: true } as never,
			ctx as never,
		);
		expect(result).toBeUndefined();
		expect(ctx.log.warn).toHaveBeenCalledOnce();
	});

	it("a stored-key hit builds no highlighter", async () => {
		const before = highlighterBuilds();
		const node = code({ code: "y", language: "ts" });
		const key = highlightKey(node, resolveOptions({}));
		await preHighlight(
			{ content: [{ ...node, pdHighlight: { key, html: "h", bg: "", fg: "" } }] },
			{},
		);
		expect(highlighterBuilds()).toBe(before);
	});
});
