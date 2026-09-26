import { describe, it, expect, beforeEach } from "vitest";
import {
	highlightCode,
	resolveLanguage,
	resolveTheme,
	truncate,
	resetHighlighter,
	cacheSize,
	DEFAULT_THEME,
	MAX_LINES,
	CACHE_MAX,
} from "../src/highlight.ts";

// Building the Shiki highlighter loads a dozen grammars, so the first call in
// a file is slow. Everything after it is cheap.
const SLOW = 30_000;

describe("resolveLanguage", () => {
	it("keeps a bundled language as-is", () => {
		expect(resolveLanguage("typescript")).toBe("typescript");
		expect(resolveLanguage("python")).toBe("python");
	});

	it("accepts a bundled alias", () => {
		expect(resolveLanguage("ts")).toBe("ts");
	});

	it("normalizes case and surrounding whitespace", () => {
		expect(resolveLanguage("  TypeScript ")).toBe("typescript");
	});

	it("falls back to plaintext for an unknown language", () => {
		expect(resolveLanguage("klingon")).toBe("plaintext");
	});

	it("treats text, txt, plain and none as plaintext", () => {
		for (const name of ["text", "txt", "plain", "plaintext", "none"]) {
			expect(resolveLanguage(name)).toBe("plaintext");
		}
	});

	it("falls back to plaintext for null, undefined and empty input", () => {
		expect(resolveLanguage(null)).toBe("plaintext");
		expect(resolveLanguage(undefined)).toBe("plaintext");
		expect(resolveLanguage("")).toBe("plaintext");
		expect(resolveLanguage("   ")).toBe("plaintext");
	});
});

describe("resolveTheme", () => {
	it("keeps a bundled theme as-is", () => {
		expect(resolveTheme("nord")).toBe("nord");
	});

	it("falls back to the default theme for an unknown name", () => {
		expect(resolveTheme("not-a-theme")).toBe(DEFAULT_THEME);
	});

	it("falls back to the default theme for null and undefined", () => {
		expect(resolveTheme(null)).toBe(DEFAULT_THEME);
		expect(resolveTheme(undefined)).toBe(DEFAULT_THEME);
	});
});

describe("truncate", () => {
	it("leaves code at or under the line limit untouched", () => {
		const code = "a\nb\nc";
		expect(truncate(code)).toBe(code);
	});

	it("cuts code over the line limit and says how much was dropped", () => {
		const code = Array.from({ length: MAX_LINES + 5 }, (_, i) => `line ${i}`).join("\n");
		const result = truncate(code);
		const lines = result.split("\n");
		expect(lines).toHaveLength(MAX_LINES + 1);
		expect(lines.at(-1)).toBe("... truncated, 5 more lines not shown");
	});

	it("uses the singular form when exactly one line is dropped", () => {
		const code = Array.from({ length: MAX_LINES + 1 }, () => "x").join("\n");
		expect(truncate(code).split("\n").at(-1)).toBe("... truncated, 1 more line not shown");
	});
});

describe("highlightCode", () => {
	beforeEach(() => {
		resetHighlighter();
	});

	it("returns highlighted HTML for TypeScript", async () => {
		const html = await highlightCode("const answer: number = 42;", "typescript");
		expect(html).toContain("<pre");
		expect(html).toContain("<code");
		expect(html).toContain("answer");
		// Shiki writes per-token colours inline; without them nothing was highlighted.
		expect(html).toContain("color:");
	}, SLOW);

	it("returns highlighted HTML for Python", async () => {
		const html = await highlightCode("def greet(name):\n    return name", "python");
		expect(html).toContain("<pre");
		expect(html).toContain("greet");
		expect(html).toContain("color:");
	}, SLOW);

	it("falls back to plaintext for an unknown language instead of throwing", async () => {
		const html = await highlightCode("some code", "klingon");
		expect(html).toContain("some code");
	}, SLOW);

	it("handles a null or undefined language", async () => {
		await expect(highlightCode("plain", null)).resolves.toContain("plain");
		await expect(highlightCode("plain", undefined)).resolves.toContain("plain");
	}, SLOW);

	it("returns an empty pre block for empty code", async () => {
		const html = await highlightCode("", "typescript");
		expect(html).toBe('<pre class="shiki plugdash-codeblock-empty"><code></code></pre>');
		expect(cacheSize()).toBe(0);
	});

	it("applies the requested theme as a class", async () => {
		const html = await highlightCode("const x = 1;", "typescript", { theme: "nord" });
		expect(html).toContain("nord");
	}, SLOW);

	it("applies the default theme when none is given", async () => {
		const html = await highlightCode("const x = 1;", "typescript");
		expect(html).toContain(DEFAULT_THEME);
	}, SLOW);

	it("falls back to the default theme for an unknown theme name", async () => {
		const html = await highlightCode("const x = 1;", "typescript", { theme: "nope" });
		expect(html).toContain(DEFAULT_THEME);
	}, SLOW);

	it("emits light-mode CSS variables when a light theme is configured", async () => {
		const html = await highlightCode("const x = 1;", "typescript", {
			theme: "github-dark",
			lightTheme: "github-light",
		});
		expect(html).toContain("--shiki-light");
	}, SLOW);

	it("escapes HTML characters in the source", async () => {
		const html = await highlightCode('const tag = "<script>&</script>";', "typescript");
		expect(html).toContain("&#x3C;");
		expect(html).not.toContain("<script>");
	}, SLOW);

	it("caches repeated identical calls", async () => {
		const first = await highlightCode("const x = 1;", "typescript");
		expect(cacheSize()).toBe(1);
		const second = await highlightCode("const x = 1;", "typescript");
		expect(second).toBe(first);
		expect(cacheSize()).toBe(1);
	}, SLOW);

	it("caches separately per theme", async () => {
		await highlightCode("const x = 1;", "typescript", { theme: "github-dark" });
		await highlightCode("const x = 1;", "typescript", { theme: "nord" });
		expect(cacheSize()).toBe(2);
	}, SLOW);

	it("evicts the oldest entry once the cache is full", async () => {
		for (let i = 0; i < CACHE_MAX + 5; i += 1) {
			await highlightCode(`line ${i}`, "text");
		}
		expect(cacheSize()).toBe(CACHE_MAX);

		// The first entry is gone, the most recent one is still there.
		await highlightCode("line 0", "text");
		expect(cacheSize()).toBe(CACHE_MAX);
	}, SLOW);

	it("truncates code over the line limit before highlighting", async () => {
		const code = Array.from({ length: MAX_LINES + 3 }, () => "x").join("\n");
		const html = await highlightCode(code, "text");
		expect(html).toContain("truncated, 3 more lines not shown");
	}, SLOW);
});
