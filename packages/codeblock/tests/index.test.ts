import { describe, it, expect } from "vitest";
import { codeblockPlugin, createPlugin } from "../src/index.ts";
import type { CodeblockConfig } from "../src/highlight.ts";
import type { PluginDescriptor } from "@plugdash/types";

// ── Descriptor factory ──

describe("codeblockPlugin() descriptor", () => {
	it("returns a valid PluginDescriptor", () => {
		const descriptor = codeblockPlugin();
		expect(descriptor.id).toBe("codeblock");
		expect(descriptor.version).toBe("0.1.0");
		expect(descriptor.format).toBe("native");
		expect(descriptor.entrypoint).toBe("@plugdash/codeblock");
	});

	it("declares componentsEntry pointing to the ./astro export", () => {
		expect(codeblockPlugin().componentsEntry).toBe("@plugdash/codeblock/astro");
	});

	it("declares only the content:read capability", () => {
		expect(codeblockPlugin().capabilities).toEqual(["content:read"]);
	});

	it("defaults to empty options", () => {
		expect(codeblockPlugin().options).toEqual({});
	});

	it("carries the given config through as options", () => {
		const descriptor = codeblockPlugin({
			theme: "nord",
			lightTheme: "github-light",
			lineNumbers: true,
		});
		expect(descriptor.options).toEqual({
			theme: "nord",
			lightTheme: "github-light",
			lineNumbers: true,
		});
	});

	it("returns a fresh options object each call", () => {
		const config = { theme: "nord" };
		const first = codeblockPlugin(config);
		const second = codeblockPlugin();
		expect(second.options).toEqual({});
		expect(first.options).toEqual({ theme: "nord" });
	});

	it("satisfies the PluginDescriptor type", () => {
		const descriptor: PluginDescriptor<CodeblockConfig> = codeblockPlugin();
		expect(descriptor).toBeDefined();
	});
});

// ── Native plugin definition (createPlugin) ──

describe("createPlugin() native definition", () => {
	it("returns a definition with id and version", () => {
		const definition = createPlugin();
		expect(definition.id).toBe("codeblock");
		expect(definition.version).toBe("0.1.0");
	});

	// Regression: EmDash's plugin list API reads capabilities/allowedHosts/
	// storage/routes off the native createPlugin() result. If any are
	// undefined the admin Plugin Manager crashes on `.length`. definePlugin()
	// must fill these in.
	it("returns a fully normalized ResolvedPlugin shape", () => {
		const definition = createPlugin();
		expect(definition.capabilities).toEqual([]);
		expect(definition.allowedHosts).toEqual([]);
		expect(definition.storage).toEqual({});
		expect(definition.routes).toEqual({});
	});

	// codeblock changes how existing code blocks render; it never runs on save.
	it("registers no hooks", () => {
		expect(createPlugin().hooks).toEqual({});
	});

	// The `code` block type ships with EmDash, so this plugin must not add
	// a second editor entry for it.
	it("registers no portable text block types", () => {
		const definition = createPlugin();
		expect(definition.admin?.portableTextBlocks ?? []).toEqual([]);
	});
});

// ── descriptor + definition consistency ──

describe("descriptor and definition consistency", () => {
	it("share the same id", () => {
		expect(codeblockPlugin().id).toBe(createPlugin().id);
	});

	it("share the same version", () => {
		expect(codeblockPlugin().version).toBe(createPlugin().version);
	});

	it("descriptor version matches the published package version", async () => {
		const pkg = await import("../package.json", { with: { type: "json" } });
		expect(codeblockPlugin().version).toBe(pkg.default.version);
	});
});
