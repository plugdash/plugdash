import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { makeContext, makeContentItem } from "@plugdash/testing";
import { CARD_MIME } from "../src/card.ts";

// Integration tests for the socialcard plugin.
// These exercise the full hook lifecycle against a mocked EmDash context.
// A real EmDashTestClient testbed is not available, so the mocks simulate
// the host's behaviour closely enough to catch real regressions.

const UPLOADED_URL = "https://cdn.example.com/media/og-content-001.svg";

describe("socialcard integration", () => {
	let ctx: ReturnType<typeof makeContext>;
	let upload: ReturnType<typeof vi.fn>;
	const kvStore: Map<string, unknown> = new Map();

	beforeEach(() => {
		kvStore.clear();
		delete globalThis.__plugdash_socialcard_config__;
		ctx = makeContext();

		// Simulate a real KV store backed by a Map
		ctx.kv.get = vi.fn().mockImplementation((key: string) => {
			return Promise.resolve(kvStore.get(key) ?? null);
		});
		ctx.kv.set = vi.fn().mockImplementation((key: string, value: unknown) => {
			kvStore.set(key, value);
			return Promise.resolve();
		});
		ctx.kv.delete = vi.fn().mockImplementation((key: string) => {
			kvStore.delete(key);
			return Promise.resolve();
		});
		ctx.kv.list = vi.fn().mockImplementation((prefix?: string) => {
			const entries: Array<{ key: string; value: unknown }> = [];
			for (const [key, value] of kvStore.entries()) {
				if (!prefix || key.startsWith(prefix)) entries.push({ key, value });
			}
			return Promise.resolve(entries);
		});

		// makeContext leaves media undefined (it is capability-gated), so the
		// media:write surface is wired up here.
		upload = vi.fn().mockResolvedValue({
			mediaId: "media-001",
			storageKey: "media/og-content-001.svg",
			url: UPLOADED_URL,
		});
		ctx.media = {
			get: vi.fn(),
			list: vi.fn(),
			upload,
		} as unknown as typeof ctx.media;

		ctx.content!.get = vi.fn().mockResolvedValue(makeContentItem());
		ctx.content!.update = vi.fn().mockImplementation((_c, _id, data) =>
			Promise.resolve({ ...makeContentItem(), data }),
		);
	});

	afterEach(() => {
		delete globalThis.__plugdash_socialcard_config__;
		vi.doUnmock("../src/card.ts");
		vi.resetModules();
	});

	async function runInstall() {
		const plugin = await import("../src/sandbox-entry.ts");
		const hook = plugin.default.hooks!["plugin:install"];
		await hook.handler({}, ctx);
	}

	async function runAfterSave(
		content: Record<string, unknown>,
		collection = "posts",
	) {
		const plugin = await import("../src/sandbox-entry.ts");
		const hook = plugin.default.hooks!["content:afterSave"];
		return hook.handler({ content, collection, isNew: false }, ctx);
	}

	function published(overrides: Record<string, unknown> = {}) {
		return makeContentItem({
			status: "published",
			publishedAt: "2026-01-15T00:00:00Z",
			data: { title: "Shipping a plugin", author: "Ada Lovelace", metadata: {} },
			...overrides,
		});
	}

	/** The SVG handed to ctx.media.upload on the first call. */
	function uploadedSvg(): string {
		const call = upload.mock.calls[0]!;
		return new TextDecoder().decode(call[2] as ArrayBuffer);
	}

	/** The metadata object written back by ctx.content.update. */
	function writtenMetadata(): Record<string, unknown> {
		const update = ctx.content!.update as ReturnType<typeof vi.fn>;
		const call = update.mock.calls.at(-1)!;
		return (call[2] as { metadata: Record<string, unknown> }).metadata;
	}

	describe("plugin:install", () => {
		it("seeds an empty config when no bootstrap is present", async () => {
			await runInstall();
			expect(kvStore.get("config")).toEqual({});
			expect(ctx.log.info).toHaveBeenCalledWith(
				"socialcard: installed",
				expect.objectContaining({ template: "default" }),
			);
		});

		it("seeds the bootstrap config from astro.config.mjs", async () => {
			globalThis.__plugdash_socialcard_config__ = { template: "bold" };
			await runInstall();
			expect(kvStore.get("config")).toEqual({ template: "bold" });
			expect(ctx.log.info).toHaveBeenCalledWith(
				"socialcard: installed",
				expect.objectContaining({ template: "bold" }),
			);
		});

		it("logs rather than throwing when KV is unavailable", async () => {
			ctx.kv.set = vi.fn().mockRejectedValue(new Error("kv down"));
			await expect(runInstall()).resolves.toBeUndefined();
			expect(ctx.log.error).toHaveBeenCalledWith(
				"socialcard: install failed",
				expect.objectContaining({ err: expect.stringContaining("kv down") }),
			);
		});
	});

	describe("content:afterSave", () => {
		it("skips non-published content", async () => {
			await runAfterSave(published({ status: "draft" }));
			expect(upload).not.toHaveBeenCalled();
			expect(ctx.content!.update).not.toHaveBeenCalled();
		});

		it("uploads the rendered card as an image with the card media type", async () => {
			await runAfterSave(published());

			expect(upload).toHaveBeenCalledTimes(1);
			const [filename, mime, buffer] = upload.mock.calls[0]!;
			expect(filename).toBe("og-content-001.svg");
			expect(mime).toBe(CARD_MIME);
			expect(buffer).toBeInstanceOf(ArrayBuffer);

			const svg = uploadedSvg();
			expect(svg.startsWith("<svg ")).toBe(true);
			expect(svg).toContain("Shipping a plugin");
			expect(svg).toContain("Ada Lovelace");
			expect(svg).toContain("January 15, 2026");
		});

		it("writes the returned URL to metadata.ogImage", async () => {
			await runAfterSave(published());
			expect(ctx.content!.update).toHaveBeenCalledWith(
				"posts",
				"content-001",
				{ metadata: { ogImage: UPLOADED_URL } },
			);
			expect(ctx.log.info).toHaveBeenCalledWith(
				"socialcard: generated",
				expect.objectContaining({ id: "content-001", url: UPLOADED_URL }),
			);
		});

		it("merges ogImage into existing metadata without overwriting other fields", async () => {
			ctx.content!.get = vi.fn().mockResolvedValue(
				makeContentItem({
					data: {
						metadata: {
							readingTimeMinutes: 4,
							wordCount: 812,
							shortlink: { code: "ab12" },
						},
					},
				}),
			);

			await runAfterSave(published());

			expect(writtenMetadata()).toEqual({
				readingTimeMinutes: 4,
				wordCount: 812,
				shortlink: { code: "ab12" },
				ogImage: UPLOADED_URL,
			});
		});

		it("overwrites an existing ogImage on republish", async () => {
			ctx.content!.get = vi.fn().mockResolvedValue(
				makeContentItem({
					data: {
						metadata: { ogImage: "https://cdn.example.com/media/stale.svg" },
					},
				}),
			);

			await runAfterSave(published());

			expect(writtenMetadata().ogImage).toBe(UPLOADED_URL);
			// Same filename, so the stored asset is replaced rather than orphaned.
			expect(upload.mock.calls[0]![0]).toBe("og-content-001.svg");
		});

		it("does not fail the publish when card generation throws", async () => {
			vi.resetModules();
			vi.doMock("../src/card.ts", async () => {
				const actual =
					await vi.importActual<typeof import("../src/card.ts")>(
						"../src/card.ts",
					);
				return {
					...actual,
					renderCard: () => {
						throw new Error("render boom");
					},
				};
			});

			await expect(runAfterSave(published())).resolves.toBeUndefined();
			expect(upload).not.toHaveBeenCalled();
			expect(ctx.content!.update).not.toHaveBeenCalled();
			expect(ctx.log.error).toHaveBeenCalledWith(
				"socialcard: afterSave failed",
				expect.objectContaining({
					err: expect.stringContaining("render boom"),
					collection: "posts",
				}),
			);
		});

		it("does not fail the publish when the upload fails", async () => {
			upload.mockRejectedValue(new Error("r2 unavailable"));

			await expect(runAfterSave(published())).resolves.toBeUndefined();
			expect(ctx.content!.update).not.toHaveBeenCalled();
			expect(ctx.log.error).toHaveBeenCalledWith(
				"socialcard: afterSave failed",
				expect.objectContaining({
					err: expect.stringContaining("r2 unavailable"),
				}),
			);
		});

		it("does not fail the publish when the metadata write fails", async () => {
			ctx.content!.update = vi.fn().mockRejectedValue(
				new Error("no such column: metadata"),
			);

			await expect(runAfterSave(published())).resolves.toBeUndefined();
			expect(ctx.log.error).toHaveBeenCalledWith(
				"socialcard: afterSave failed",
				expect.objectContaining({
					err: expect.stringContaining("no such column"),
				}),
			);
		});

		it("reports a missing media:write capability instead of uploading", async () => {
			ctx.media = undefined;
			await runAfterSave(published());
			expect(ctx.content!.update).not.toHaveBeenCalled();
			expect(ctx.log.error).toHaveBeenCalledWith(
				expect.stringContaining("media:write capability unavailable"),
			);
		});

		it("reports a missing content:write capability instead of uploading", async () => {
			ctx.content!.update = undefined;
			await runAfterSave(published());
			expect(upload).not.toHaveBeenCalled();
			expect(ctx.log.error).toHaveBeenCalledWith(
				expect.stringContaining("content:write capability unavailable"),
			);
		});

		it("uses the template stored in KV", async () => {
			kvStore.set("config", { template: "minimal" });
			await runAfterSave(published());
			const svg = uploadedSvg();
			expect(svg).not.toContain("Ada Lovelace");
			expect(svg).not.toContain("linearGradient");
		});

		it("reseeds KV when the bootstrap config changes", async () => {
			globalThis.__plugdash_socialcard_config__ = { template: "bold" };
			await runInstall();
			expect(kvStore.get("config")).toEqual({ template: "bold" });

			globalThis.__plugdash_socialcard_config__ = { template: "minimal" };
			await runAfterSave(published());

			expect(kvStore.get("config")).toEqual({ template: "minimal" });
			expect(uploadedSvg()).not.toContain("linearGradient");
		});

		it("falls back to the slug when the post has no title", async () => {
			await runAfterSave(
				published({ slug: "an-untitled-post", data: { metadata: {} } }),
			);
			expect(uploadedSvg()).toContain("an-untitled-post");
		});

		it("omits the byline when the post has neither author nor date", async () => {
			await runAfterSave(
				published({
					publishedAt: null,
					updatedAt: "",
					data: { title: "Just a title", metadata: {} },
				}),
			);
			const svg = uploadedSvg();
			expect(svg).toContain("Just a title");
			expect(svg).not.toContain("·");
		});
	});
});
