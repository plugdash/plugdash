import { describe, it, expect } from "vitest";
import { calloutPlugin, createPlugin } from "../src/index.js";
import type {
	PluginDescriptor,
	PortableTextBlockConfig,
} from "@plugdash/types";

// ── Descriptor factory ──

describe("calloutPlugin() descriptor", () => {
	it("returns a valid PluginDescriptor", () => {
		const descriptor = calloutPlugin();
		expect(descriptor.id).toBe("callout");
		expect(descriptor.version).toBe("0.1.0");
		expect(descriptor.format).toBe("native");
		expect(descriptor.entrypoint).toBe("@plugdash/callout");
	});

	it("declares componentsEntry pointing to ./astro export", () => {
		const descriptor = calloutPlugin();
		expect(descriptor.componentsEntry).toBe("@plugdash/callout/astro");
	});

	it("declares no capabilities", () => {
		const descriptor = calloutPlugin();
		expect(descriptor.capabilities).toEqual([]);
	});

	it("satisfies PluginDescriptor type", () => {
		const descriptor: PluginDescriptor = calloutPlugin();
		expect(descriptor).toBeDefined();
	});
});

// ── Native plugin definition (createPlugin) ──

describe("createPlugin() native definition", () => {
	it("returns a definition with id and version", () => {
		const definition = createPlugin();
		expect(definition.id).toBe("callout");
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

	it("declares a single portableTextBlocks entry", () => {
		const definition = createPlugin();
		const blocks = definition.admin?.portableTextBlocks;
		expect(blocks).toBeDefined();
		expect(blocks).toHaveLength(1);
	});

	it("block type is 'callout'", () => {
		const definition = createPlugin();
		const block = definition.admin!.portableTextBlocks![0]!;
		expect(block.type).toBe("callout");
		expect(block.label).toBe("Callout");
	});

	it("block has icon", () => {
		const definition = createPlugin();
		const block = definition.admin!.portableTextBlocks![0]!;
		expect(block.icon).toBeDefined();
		expect(typeof block.icon).toBe("string");
	});
});

// ── Block schema validation ──

describe("block type definition", () => {
	function getBlock(): PortableTextBlockConfig {
		const definition = createPlugin();
		return definition.admin!.portableTextBlocks![0]!;
	}

	it("has fields array", () => {
		const block = getBlock();
		expect(block.fields).toBeDefined();
		expect(Array.isArray(block.fields)).toBe(true);
	});

	it("has a variant select field with four options", () => {
		const block = getBlock();
		const variantField = block.fields!.find((f) => f.action_id === "variant");
		expect(variantField).toBeDefined();
		expect(variantField!.type).toBe("select");
		expect(variantField!.options).toHaveLength(4);

		const values = variantField!.options!.map((o) => o.value);
		expect(values).toContain("info");
		expect(values).toContain("warning");
		expect(values).toContain("tip");
		expect(values).toContain("danger");
	});

	it("has a title text_input field", () => {
		const block = getBlock();
		const titleField = block.fields!.find((f) => f.action_id === "title");
		expect(titleField).toBeDefined();
		expect(titleField!.type).toBe("text_input");
	});

	it("has a body text_input field with multiline", () => {
		const block = getBlock();
		const bodyField = block.fields!.find((f) => f.action_id === "body");
		expect(bodyField).toBeDefined();
		expect(bodyField!.type).toBe("text_input");
		expect(bodyField!.multiline).toBe(true);
	});

	it("has an icon toggle field defaulting to true", () => {
		const block = getBlock();
		const iconField = block.fields!.find((f) => f.action_id === "icon");
		expect(iconField).toBeDefined();
		expect(iconField!.type).toBe("toggle");
		expect(iconField!.initial_value).toBe(true);
	});

	it("schema validates a minimal callout (variant + body only)", () => {
		const block = getBlock();
		const requiredFields = ["variant", "body"];
		const fieldIds = block.fields!.map((f) => f.action_id);
		for (const id of requiredFields) {
			expect(fieldIds).toContain(id);
		}
	});

	it("schema validates a full callout (all fields)", () => {
		const block = getBlock();
		const allFields = ["variant", "title", "body", "icon"];
		const fieldIds = block.fields!.map((f) => f.action_id);
		for (const id of allFields) {
			expect(fieldIds).toContain(id);
		}
	});

	it("schema rejects unknown variants via options constraint", () => {
		const block = getBlock();
		const variantField = block.fields!.find((f) => f.action_id === "variant");
		const values = variantField!.options!.map((o) => o.value);
		expect(values).not.toContain("success");
		expect(values).not.toContain("error");
		expect(values).not.toContain("note");
	});
});

// ── descriptor + definition consistency ──

describe("descriptor and definition consistency", () => {
	it("descriptor and definition share the same id", () => {
		const descriptor = calloutPlugin();
		const definition = createPlugin();
		expect(descriptor.id).toBe(definition.id);
	});

	it("descriptor and definition share the same version", () => {
		const descriptor = calloutPlugin();
		const definition = createPlugin();
		expect(descriptor.version).toBe(definition.version);
	});

	it("block type matches the plugin id", () => {
		const descriptor = calloutPlugin();
		const definition = createPlugin();
		const block = definition.admin!.portableTextBlocks![0]!;
		expect(block.type).toBe(descriptor.id);
	});
});
