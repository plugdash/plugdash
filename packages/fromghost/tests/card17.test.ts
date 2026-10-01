import { describe, it, expect } from "vitest";
import { createGhostSource } from "../src/index.ts";
import type { FromghostConfig } from "../src/index.ts";
import fixture from "./fixtures/ghost-export.json";

const file = () =>
	new File([JSON.stringify(fixture)], "export.json", { type: "application/json" });

async function run(config: FromghostConfig, postTypes = ["post", "page"]) {
	const source = createGhostSource(config);
	const items = [];
	for await (const item of source.fetchContent(
		{ type: "file", file: file() },
		{ postTypes, includeDrafts: true },
	)) {
		items.push(item);
	}
	return items;
}

describe("__GHOST_URL__ resolution", () => {
	it("leaves no placeholder in the output when siteUrl is set", async () => {
		const items = await run({ siteUrl: "https://blog.example.com/" });
		expect(JSON.stringify(items)).not.toContain("__GHOST_URL__");
		const json = JSON.stringify(items);
		expect(json).toContain("https://blog.example.com/other/");
		expect(json).toContain("https://blog.example.com/content/images/2024/01/a.png");
	});

	it("lists inline images in analysis attachments", async () => {
		const source = createGhostSource({ siteUrl: "https://blog.example.com" });
		const analysis = await source.analyze({ type: "file", file: file() }, {});
		const urls = analysis.attachments.items.map((a) => a.url);
		expect(urls).toContain("https://blog.example.com/content/images/2024/01/a.png");
		expect(urls).toContain("https://blog.example.com/content/images/2024/01/cover.jpg");
		expect(analysis.attachments.count).toBe(2);
	});

	it("returns warnings in the analysis", async () => {
		const source = createGhostSource();
		const analysis = (await source.analyze({ type: "file", file: file() }, {})) as unknown as {
			warnings: string[];
		};
		expect(analysis.warnings.some((w) => w.includes("Lexical"))).toBe(true);
		expect(analysis.warnings.some((w) => w.includes("siteUrl"))).toBe(true);
	});
});

describe("paid posts", () => {
	const status = (items: Awaited<ReturnType<typeof run>>, id: string) =>
		items.find((i) => i.sourceId === id)?.status;

	it("imports as draft by default and records visibility", async () => {
		const items = await run({});
		expect(status(items, "p2")).toBe("draft");
		expect(status(items, "p1")).toBe("publish");
		expect(items.find((i) => i.sourceId === "p2")?.meta?.["visibility"]).toBe("paid");
	});

	it("publishes when asked", async () => {
		expect(status(await run({ paidPostsAs: "publish" }), "p2")).toBe("publish");
	});

	it("skips when asked", async () => {
		expect(status(await run({ paidPostsAs: "skip" }), "p2")).toBeUndefined();
	});
});

describe("fixture coverage", () => {
	it("splits pages, recovers lexical drafts, skips internal tags", async () => {
		const items = await run({});
		expect(items.find((i) => i.sourceId === "p3")?.postType).toBe("page");
		expect(items.find((i) => i.sourceId === "p4")?.content.length).toBeGreaterThan(0);
		expect(items.find((i) => i.sourceId === "p1")?.tags).toEqual(["news"]);
		expect(JSON.stringify(items)).not.toContain("ada@example.com");
	});
});
