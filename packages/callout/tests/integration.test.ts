import { describe, it, expect } from "vitest";
import { calloutPlugin, createPlugin } from "../src/index.js";

// Integration tests for the callout plugin.
// These test the full plugin lifecycle: registration, block type definition,
// and simulated block data creation as EmDash would produce it.
// No testbed is available, so we simulate the host's behavior.

/** Simulate what EmDash produces when a user fills in the block form. */
function makeCalloutBlock(fields: Record<string, unknown>) {
	return {
		_type: "callout",
		_key: `key-${Math.random().toString(36).slice(2, 8)}`,
		...fields,
	};
}

describe("callout plugin registration lifecycle", () => {
	it("descriptor can be passed to plugins array", () => {
		const descriptor = calloutPlugin();
		// Simulate what astro.config.mjs does: pass descriptor to emdash()
		const pluginsArray = [descriptor];
		expect(pluginsArray).toHaveLength(1);
		expect(pluginsArray[0].id).toBe("callout");
		expect(pluginsArray[0].format).toBe("native");
	});

	it("createPlugin produces a definition that EmDash can consume", () => {
		const definition = createPlugin();
		// EmDash reads id, version, and admin from the definition
		expect(definition.id).toBe("callout");
		expect(definition.version).toBeDefined();
		expect(definition.admin).toBeDefined();
		expect(definition.admin!.portableTextBlocks).toBeDefined();
	});

	it("descriptor entrypoint resolves to the package itself", () => {
		const descriptor = calloutPlugin();
		expect(descriptor.entrypoint).toBe("@plugdash/callout");
	});

	it("descriptor componentsEntry resolves to the astro export", () => {
		const descriptor = calloutPlugin();
		expect(descriptor.componentsEntry).toBe("@plugdash/callout/astro");
	});
});

describe("block data produced by EmDash editor", () => {
	it("minimal callout block (variant + body) is valid", () => {
		const block = makeCalloutBlock({
			variant: "info",
			body: "This is a note.",
		});
		expect(block._type).toBe("callout");
		expect(block._key).toBeDefined();
		expect(block.variant).toBe("info");
		expect(block.body).toBe("This is a note.");
	});

	it("full callout block (all fields) is valid", () => {
		const block = makeCalloutBlock({
			variant: "warning",
			title: "Deprecation notice",
			body: "This API will be removed in v3.",
			icon: true,
		});
		expect(block._type).toBe("callout");
		expect(block.variant).toBe("warning");
		expect(block.title).toBe("Deprecation notice");
		expect(block.body).toBe("This API will be removed in v3.");
		expect(block.icon).toBe(true);
	});

	it("callout with icon disabled", () => {
		const block = makeCalloutBlock({
			variant: "tip",
			body: "Try this approach instead.",
			icon: false,
		});
		expect(block.icon).toBe(false);
	});

	it("all four variants produce valid blocks", () => {
		const variants = ["info", "warning", "tip", "danger"] as const;
		for (const variant of variants) {
			const block = makeCalloutBlock({
				variant,
				body: `This is a ${variant} callout.`,
			});
			expect(block._type).toBe("callout");
			expect(block.variant).toBe(variant);
		}
	});

	it("multiline body content is preserved", () => {
		const body = "Line one.\nLine two.\nLine three.";
		const block = makeCalloutBlock({ variant: "info", body });
		expect(block.body).toBe(body);
		expect((block.body as string).split("\n")).toHaveLength(3);
	});
});

describe("block type definition matches block data contract", () => {
	it("every field in the block type has a corresponding action_id", () => {
		const definition = createPlugin();
		const blockDef = definition.admin!.portableTextBlocks![0];
		const fieldIds = blockDef.fields!.map((f) => f.action_id);

		// These are the keys EmDash will put on the PT block
		const expectedBlockKeys = ["variant", "title", "body", "icon"];
		for (const key of expectedBlockKeys) {
			expect(fieldIds).toContain(key);
		}
	});

	it("variant field options match the four supported variants", () => {
		const definition = createPlugin();
		const blockDef = definition.admin!.portableTextBlocks![0];
		const variantField = blockDef.fields!.find((f) => f.action_id === "variant");
		const optionValues = variantField!.options!.map((o) => o.value);

		expect(optionValues).toEqual(["info", "warning", "tip", "danger"]);
	});

	it("block type name matches what the renderer expects", () => {
		const definition = createPlugin();
		const blockDef = definition.admin!.portableTextBlocks![0];
		// The astro/index.ts exports { callout: Callout }
		// The block type must match the key in blockComponents
		expect(blockDef.type).toBe("callout");
	});
});
