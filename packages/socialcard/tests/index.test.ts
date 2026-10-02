import { describe, expect, it, vi } from "vitest";
import { createPlugin, pickAuthor, socialcardPlugin } from "../src/index.ts";
import { svgToPng } from "../src/render.ts";
import { renderCard } from "../src/card.ts";

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function mockCtx(seoImage: string | null = null, hasSeo = true) {
	const kv = new Map<string, unknown>();
	let upload = 0;
	return {
		kv: {
			get: vi.fn(async (k: string) => kv.get(k) ?? null),
			set: vi.fn(async (k: string, v: unknown) => void kv.set(k, v)),
		},
		log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
		schema: { getCollection: vi.fn(async () => ({ hasSeo })) },
		content: {
			get: vi.fn(async () => ({ seo: { image: seoImage } })),
			update: vi.fn(async (_c: string, _id: string, data: { seo: { image: string } }) => {
				seoImage = data.seo.image;
			}),
		},
		media: {
			upload: vi.fn(async (_name: string, _type: string, bytes: ArrayBuffer) => {
				upload++;
				return {
					mediaId: `m${upload}`,
					url: `/_emdash/api/media/file/k${upload}.png`,
					bytes,
				};
			}),
			delete: vi.fn(async () => true),
		},
	};
}

const event = (title = "Hello world") => ({
	collection: "posts",
	content: {
		id: "01ABC",
		slug: "hello",
		status: "published",
		publishedAt: "2026-10-01T00:00:00Z",
		data: { title },
	},
});

function hook(options = {}) {
	return createPlugin(options).hooks["content:afterPublish"]!;
}

async function publish(h: ReturnType<typeof hook>, ctx: ReturnType<typeof mockCtx>, e = event()) {
	await h.handler(e as never, ctx as never);
}

describe("descriptor", () => {
	it("is native and carries options", () => {
		expect(socialcardPlugin({ template: "bold" })).toMatchObject({
			id: "socialcard",
			format: "native",
			entrypoint: "@plugdash/socialcard",
			options: { template: "bold" },
		});
	});

	it("only hooks afterPublish, with a 30s timeout", () => {
		const plugin = createPlugin();
		expect(Object.keys(plugin.hooks)).toEqual(["content:afterPublish"]);
		expect(plugin.hooks["content:afterPublish"]?.timeout).toBe(30_000);
		expect(plugin.capabilities).toEqual(
			expect.arrayContaining(["content:read", "content:write", "media:write", "schema:read"]),
		);
	});
});

describe("svgToPng", () => {
	it("returns PNG bytes at the card size", async () => {
		const png = await svgToPng(renderCard({ title: "Hi", author: "A" }));
		expect([...png.subarray(0, 8)]).toEqual(PNG_SIGNATURE);
		const view = new DataView(png.buffer, png.byteOffset);
		expect(view.getUint32(16)).toBe(1200);
		expect(view.getUint32(20)).toBe(630);
	});
});

describe("afterPublish", () => {
	it("uploads a PNG and sets seo.image with a seo-only update", async () => {
		const ctx = mockCtx();
		await publish(hook(), ctx);
		expect(ctx.media.upload).toHaveBeenCalledTimes(1);
		const [name, type, bytes] = ctx.media.upload.mock.calls[0]!;
		expect(name).toBe("og-01ABC.png");
		expect(type).toBe("image/png");
		expect([...new Uint8Array(bytes).subarray(0, 8)]).toEqual(PNG_SIGNATURE);
		expect(ctx.content.update).toHaveBeenCalledWith("posts", "01ABC", {
			seo: { image: "/_emdash/api/media/file/k1.png" },
		});
	});

	it("skips the render when nothing changed", async () => {
		const ctx = mockCtx();
		const h = hook();
		await publish(h, ctx);
		await publish(h, ctx);
		expect(ctx.media.upload).toHaveBeenCalledTimes(1);
		expect(ctx.log.info).toHaveBeenCalledWith("card unchanged, skipping render", { id: "01ABC" });
	});

	it("re-renders on a title change and deletes the old card", async () => {
		const ctx = mockCtx();
		const h = hook();
		await publish(h, ctx);
		await publish(h, ctx, event("New title"));
		expect(ctx.media.upload).toHaveBeenCalledTimes(2);
		expect(ctx.media.delete).toHaveBeenCalledWith("m1");
		expect(ctx.content.update).toHaveBeenLastCalledWith("posts", "01ABC", {
			seo: { image: "/_emdash/api/media/file/k2.png" },
		});
	});

	it("leaves a hand-set seo.image alone", async () => {
		const ctx = mockCtx("/_emdash/api/media/file/mine.jpg");
		await publish(hook(), ctx);
		expect(ctx.media.upload).not.toHaveBeenCalled();
		expect(ctx.content.update).not.toHaveBeenCalled();
	});

	it("replaces a hand-set seo.image with overwriteSeoImage", async () => {
		const ctx = mockCtx("/_emdash/api/media/file/mine.jpg");
		await publish(hook({ overwriteSeoImage: true }), ctx);
		expect(ctx.content.update).toHaveBeenCalledTimes(1);
	});

	it("warns once and skips collections without SEO", async () => {
		const ctx = mockCtx(null, false);
		const h = hook();
		await publish(h, ctx, { ...event(), collection: "noseo" });
		await publish(h, ctx, { ...event(), collection: "noseo" });
		expect(ctx.log.warn).toHaveBeenCalledTimes(1);
		expect(ctx.media.upload).not.toHaveBeenCalled();
	});

	it("never throws when the upload fails", async () => {
		const ctx = mockCtx();
		ctx.media.upload.mockRejectedValueOnce(new Error("File type not allowed"));
		await expect(publish(hook(), ctx)).resolves.toBeUndefined();
		expect(ctx.log.error).toHaveBeenCalled();
	});
});

describe("pickAuthor", () => {
	it("reads data.author, then the primary byline", () => {
		expect(pickAuthor({ data: { author: "Ana" } })).toBe("Ana");
		expect(pickAuthor({ data: { author: { name: "Bo" } } })).toBe("Bo");
		expect(pickAuthor({ data: {}, byline: { displayName: "Cy" } })).toBe("Cy");
		expect(pickAuthor({ data: {} })).toBeNull();
	});
});
