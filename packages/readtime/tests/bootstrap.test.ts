import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { makeContext, makeContentItem } from "@plugdash/testing";
import type { PortableTextBlock } from "@portabletext/types";

// ── Bootstrap + install + collection-allowlist lifecycle ──
// Verifies that config passed to readtimePlugin({ collections }) at build
// time is persisted to KV on install and respected at afterSave time.
// Regression test for: readtime running on every collection and crashing
// with SqliteError on collections that have no metadata field.

function makeBlocks(text: string): PortableTextBlock[] {
	return [
		{
			_type: "block",
			_key: "b1",
			children: [{ _type: "span", _key: "s1", text, marks: [] }],
			markDefs: [],
			style: "normal",
		},
	];
}

describe("readtime bootstrap + collections allowlist", () => {
	let ctx: ReturnType<typeof makeContext>;
	let kvStore: Map<string, unknown>;

	beforeEach(() => {
		kvStore = new Map();
		ctx = makeContext();

		ctx.kv.get = vi.fn().mockImplementation((key: string) => {
			return Promise.resolve(kvStore.get(key) ?? null);
		});
		ctx.kv.set = vi.fn().mockImplementation((key: string, value: unknown) => {
			kvStore.set(key, value);
			return Promise.resolve();
		});

		// Default: content.get returns a valid record; content.update succeeds
		ctx.content!.get = vi.fn().mockImplementation((_collection, id) =>
			Promise.resolve({
				id,
				slug: "x",
				status: "published",
				data: { body: makeBlocks("one two three"), metadata: {} },
				createdAt: "2026-01-01T00:00:00Z",
				updatedAt: "2026-01-01T00:00:00Z",
			}),
		);
		ctx.content!.update = vi.fn().mockResolvedValue(undefined);
	});

	afterEach(() => {
		delete globalThis.__plugdash_readtime_config__;
	});

	async function runInstall() {
		const plugin = await import("../src/sandbox-entry.ts");
		await plugin.default.hooks!["plugin:install"].handler({}, ctx);
	}

	async function runAfterSave(id: string, collection: string) {
		const plugin = await import("../src/sandbox-entry.ts");
		const content = makeContentItem({
			id,
			status: "published",
			data: { body: makeBlocks("one two three"), metadata: {} },
		});
		await plugin.default.hooks!["content:afterSave"].handler(
			{ content, collection, isNew: false },
			ctx,
		);
	}

	it("install without bootstrap seeds defaults (wpm=238, collections=null)", async () => {
		await runInstall();
		expect(kvStore.get("config:wordsPerMinute")).toBe(238);
		expect(kvStore.get("config:collections")).toBe(null);
	});

	it("install with bootstrap seeds wordsPerMinute and collections from config", async () => {
		globalThis.__plugdash_readtime_config__ = {
			wordsPerMinute: 300,
			collections: ["blog", "articles"],
		};

		await runInstall();

		expect(kvStore.get("config:wordsPerMinute")).toBe(300);
		expect(kvStore.get("config:collections")).toEqual(["blog", "articles"]);
		expect(kvStore.has("readtime:bootstrapHash")).toBe(true);
	});

	it("install with partial bootstrap fills missing values with defaults", async () => {
		globalThis.__plugdash_readtime_config__ = {
			collections: ["blog"],
			// wordsPerMinute omitted
		};

		await runInstall();

		expect(kvStore.get("config:wordsPerMinute")).toBe(238);
		expect(kvStore.get("config:collections")).toEqual(["blog"]);
	});

	it("afterSave runs on a collection inside the allowlist", async () => {
		globalThis.__plugdash_readtime_config__ = {
			collections: ["blog"],
		};
		await runInstall();

		await runAfterSave("p1", "blog");

		expect(ctx.content!.update).toHaveBeenCalledOnce();
	});

	it("afterSave skips a collection outside the allowlist (regression: the SQL crash case)", async () => {
		globalThis.__plugdash_readtime_config__ = {
			collections: ["blog"],
		};
		await runInstall();

		await runAfterSave("plugin-1", "plugins");

		expect(ctx.content!.update).not.toHaveBeenCalled();
	});

	it("afterSave runs on every collection when collections=null (no bootstrap)", async () => {
		await runInstall(); // defaults: collections=null

		await runAfterSave("a", "blog");
		await runAfterSave("b", "articles");
		await runAfterSave("c", "projects");

		expect(ctx.content!.update).toHaveBeenCalledTimes(3);
	});

	it("afterSave reseeds KV when bootstrap config changes between runs", async () => {
		// First install with collections=["blog"]
		globalThis.__plugdash_readtime_config__ = { collections: ["blog"] };
		await runInstall();
		expect(kvStore.get("config:collections")).toEqual(["blog"]);

		// Dev edits code to add "articles" - new bootstrap, same process
		globalThis.__plugdash_readtime_config__ = {
			collections: ["blog", "articles"],
		};

		// Next afterSave should detect the hash change and reseed
		await runAfterSave("a1", "articles");

		expect(kvStore.get("config:collections")).toEqual(["blog", "articles"]);
		expect(ctx.content!.update).toHaveBeenCalledOnce();
	});

	it("afterSave does not reseed when bootstrap hash is unchanged", async () => {
		globalThis.__plugdash_readtime_config__ = { collections: ["blog"] };
		await runInstall();

		const setCallsAfterInstall = (
			ctx.kv.set as ReturnType<typeof vi.fn>
		).mock.calls.length;

		// afterSave on an allowed collection - should not rewrite config:* keys
		await runAfterSave("a1", "blog");

		const setCallsAfter = (
			ctx.kv.set as ReturnType<typeof vi.fn>
		).mock.calls.length;
		expect(setCallsAfter).toBe(setCallsAfterInstall);
	});

	it("afterSave skips processing when bootstrap changes cause allowlist removal", async () => {
		// Start with ["blog", "plugins"] - plugins was accidentally allowed
		globalThis.__plugdash_readtime_config__ = {
			collections: ["blog", "plugins"],
		};
		await runInstall();

		// Dev fixes the mistake
		globalThis.__plugdash_readtime_config__ = { collections: ["blog"] };

		// afterSave on the now-removed collection reseeds, then skips
		await runAfterSave("plug-1", "plugins");

		expect(kvStore.get("config:collections")).toEqual(["blog"]);
		expect(ctx.content!.update).not.toHaveBeenCalled();
	});
});
