import { describe, it, expect, beforeEach } from "vitest";
import { codeblockPlugin, createPlugin } from "../src/index.ts";
import { getSiteConfig, highlightCode, resetHighlighter } from "../src/highlight.ts";

// Integration tests for the codeblock plugin: registration, and rendering the
// code blocks EmDash actually stores. No testbed is available, so the host's
// behaviour is simulated.

const SLOW = 30_000;

/** Simulate a Portable Text code block as EmDash stores it. */
function makeCodeBlock(fields: { code: string; language?: string; filename?: string }) {
	return {
		_type: "code",
		_key: `key-${Math.random().toString(36).slice(2, 8)}`,
		...fields,
	};
}

describe("codeblock plugin registration lifecycle", () => {
	it("descriptor can be passed to the plugins array", () => {
		const pluginsArray = [codeblockPlugin()];
		expect(pluginsArray).toHaveLength(1);
		expect(pluginsArray[0]!.id).toBe("codeblock");
		expect(pluginsArray[0]!.format).toBe("native");
	});

	it("createPlugin produces a definition EmDash can consume", () => {
		const definition = createPlugin();
		expect(definition.id).toBe("codeblock");
		expect(definition.version).toBeDefined();
	});

	it("descriptor entrypoint resolves to the package itself", () => {
		expect(codeblockPlugin().entrypoint).toBe("@plugdash/codeblock");
	});

	it("descriptor componentsEntry resolves to the astro export", () => {
		// src/astro/index.ts exports { code: CodeBlock }, keyed by the block
		// _type EmDash stores.
		expect(codeblockPlugin().componentsEntry).toBe("@plugdash/codeblock/astro");
	});
});

describe("rendering the code blocks EmDash stores", () => {
	beforeEach(() => {
		resetHighlighter();
	});

	it("highlights a block with a known language", async () => {
		const block = makeCodeBlock({
			code: "export const x: number = 1;",
			language: "typescript",
		});
		const html = await highlightCode(block.code, block.language);
		expect(html).toContain("<pre");
		expect(html).toContain("x");
		expect(html).toContain("color:");
	}, SLOW);

	it("renders a block saved without a language", async () => {
		const block = makeCodeBlock({ code: "just some text" });
		const html = await highlightCode(block.code, block.language);
		expect(html).toContain("just some text");
	}, SLOW);

	it("renders a block whose language EmDash does not know", async () => {
		const block = makeCodeBlock({ code: "10 PRINT", language: "basic-ish" });
		await expect(highlightCode(block.code, block.language)).resolves.toContain("10 PRINT");
	}, SLOW);

	it("renders an empty block without throwing", async () => {
		const block = makeCodeBlock({ code: "", language: "typescript" });
		await expect(highlightCode(block.code, block.language)).resolves.toContain("<pre");
	});

	it("preserves indentation and blank lines", async () => {
		const code = "def a():\n\n    return 1";
		const html = await highlightCode(code, "python");
		expect(html).toContain("    return");
		// Shiki wraps each source line, blank ones included.
		expect(html.match(/class="line"/g) ?? []).toHaveLength(3);
	}, SLOW);

	it("hands the descriptor options to the auto-wired component", () => {
		// EmDash calls createPlugin(descriptor.options) in the server runtime.
		// The component only receives the block node, so it reads the rest here.
		const descriptor = codeblockPlugin({ theme: "tokyo-night", lightTheme: "catppuccin-latte" });
		createPlugin(descriptor.options);
		expect(getSiteConfig()).toEqual({ theme: "tokyo-night", lightTheme: "catppuccin-latte" });
	});

	it("falls back to an empty config before createPlugin has run", () => {
		(globalThis as Record<string, unknown>).__plugdash_codeblock_config__ = undefined;
		expect(getSiteConfig()).toEqual({});
	});
});
