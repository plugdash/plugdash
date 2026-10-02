import { describe, expect, it, vi } from "vitest";

// docs/ is outside the pnpm workspace, so emdash is not installed here.
// A real plugin package lists emdash as a devDependency and drops this mock.
vi.mock("emdash", () => ({ definePlugin: (def: unknown) => def }));

const { createPlugin, examplePlugin, getOptions } = await import("../src/index");

function makeCtx() {
	return {
		log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
		settings: { get: vi.fn(async () => undefined) },
	};
}

describe("native-hooks example", () => {
	it("descriptor carries options and no runtime code", () => {
		const d = examplePlugin({ greeting: "hi" });
		expect(d).toEqual({
			id: "native-example",
			version: "0.0.0",
			format: "native",
			entrypoint: "@plugdash/example-native-hooks",
			options: { greeting: "hi" },
		});
	});

	it("getOptions fills defaults", () => {
		expect(getOptions()).toEqual({ collections: [], greeting: "hello", sleepMs: 0 });
		expect(getOptions({ collections: ["posts"] }).collections).toEqual(["posts"]);
	});

	it("declares content:write so beforeSave is registered", () => {
		const plugin = createPlugin() as { capabilities: string[] };
		expect(plugin.capabilities).toContain("content:write");
	});

	it("beforeSave adds lineCount to code nodes and returns the data object", async () => {
		const plugin = createPlugin() as any;
		const hook = plugin.hooks["content:beforeSave"];
		const out = await hook.handler(
			{
				collection: "posts",
				isNew: true,
				content: { title: "t", content: [{ _type: "code", _key: "c", code: "a\nb" }] },
			},
			makeCtx(),
		);
		expect(out.title).toBe("t");
		expect(out.content[0].lineCount).toBe(2);
	});

	it("beforeSave skips collections not in options", async () => {
		const plugin = createPlugin({ collections: ["pages"] }) as any;
		const out = await plugin.hooks["content:beforeSave"].handler(
			{ collection: "posts", isNew: true, content: { content: [{ _type: "code", code: "x" }] } },
			makeCtx(),
		);
		expect(out).toBeUndefined();
	});

	it("afterPublish has a 60s timeout", () => {
		const plugin = createPlugin() as any;
		expect(plugin.hooks["content:afterPublish"].timeout).toBe(60_000);
	});

	it("ping route returns options", async () => {
		const plugin = createPlugin({ greeting: "yo" }) as any;
		expect(plugin.routes.ping.public).toBe(true);
		expect(await plugin.routes.ping.handler()).toEqual({ greeting: "yo", collections: [] });
	});
});
