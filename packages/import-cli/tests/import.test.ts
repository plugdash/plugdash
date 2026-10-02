import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { ImportError, runImport } from "../src/import.ts";

const FIXTURES = join(import.meta.dirname, "fixtures");
const GHOST = join(FIXTURES, "ghost-export.json");
const SITE = "http://site.test";
const OLD_GHOST = "http://old-ghost.test";

type Fields = { slug: string; type: string }[];

const BLOG_FIELDS: Fields = [
	{ slug: "title", type: "string" },
	{ slug: "featured_image", type: "image" },
	{ slug: "content", type: "portableText" },
	{ slug: "excerpt", type: "text" },
];

/** An in-memory stand-in for the EmDash REST API and an old Ghost site. */
function fakeSite(
	collections: Record<string, Fields> = { posts: BLOG_FIELDS, pages: BLOG_FIELDS.slice(0, 3) },
) {
	const entries = new Map<string, Record<string, unknown>>();
	const terms = new Map<string, Set<string>>([
		["tag", new Set()],
		["category", new Set()],
	]);
	const media: { id: string; filename: string }[] = [];
	const published: string[] = [];
	const requests: { method: string; path: string; headers: Record<string, string> }[] = [];

	const json = (data: unknown, status = 200) =>
		new Response(
			JSON.stringify(status < 400 ? { success: true, data } : { success: false, error: data }),
			{
				status,
				headers: { "Content-Type": "application/json" },
			},
		);

	const fetch = async (input: RequestInfo | URL, init: RequestInit = {}) => {
		const url = new URL(String(input));
		const method = init.method ?? "GET";
		if (url.origin === OLD_GHOST) {
			return url.pathname.endsWith("missing.png")
				? new Response("nope", { status: 404 })
				: new Response(new Uint8Array([1, 2, 3]), { headers: { "Content-Type": "image/png" } });
		}
		const path = url.pathname.replace("/_emdash/api", "");
		requests.push({ method, path, headers: (init.headers ?? {}) as Record<string, string> });
		let m: RegExpMatchArray | null;

		if ((m = path.match(/^\/schema\/collections\/([^/]+)$/))) {
			const fields = collections[m[1]!];
			return fields
				? json({ item: { slug: m[1], fields } })
				: json({ code: "NOT_FOUND", message: "nope" }, 404);
		}
		if (path === "/taxonomies") {
			return json({
				taxonomies: [
					{ name: "tag", collections: ["posts"] },
					{ name: "category", collections: ["posts"] },
				],
			});
		}
		if ((m = path.match(/^\/taxonomies\/([^/]+)\/terms$/))) {
			const set = terms.get(m[1]!)!;
			if (method === "GET") return json({ terms: [...set].map((slug) => ({ slug })) });
			set.add(JSON.parse(String(init.body)).slug);
			return json({});
		}
		if (path === "/media" && method === "POST") {
			const file = (init.body as FormData).get("file") as File;
			const id = `m${media.length + 1}`;
			media.push({ id, filename: file.name });
			return json({
				item: {
					id,
					url: `/_emdash/api/media/file/${id}.png`,
					filename: file.name,
					mimeType: "image/png",
					storageKey: `${id}.png`,
					width: 10,
					height: 5,
				},
			});
		}
		if ((m = path.match(/^\/content\/([^/]+)\/([^/]+)\/publish$/))) {
			published.push(m[2]!);
			return json({});
		}
		if ((m = path.match(/^\/content\/([^/]+)\/([^/]+)$/))) {
			const entry = entries.get(`${m[1]}/${m[2]}`);
			return entry ? json({ item: entry }) : json({ code: "NOT_FOUND", message: "nope" }, 404);
		}
		if ((m = path.match(/^\/content\/([^/]+)$/)) && method === "POST") {
			const body = JSON.parse(String(init.body));
			const key = `${m[1]}/${body.slug}`;
			if (body.slug === "taken") return json({ code: "SLUG_CONFLICT", message: "taken" }, 409);
			if (body.slug === "explodes") return json({ code: "INTERNAL", message: "boom" }, 500);
			const item = { id: `e${entries.size + 1}`, ...body };
			entries.set(key, item);
			return json({ item });
		}
		return json({ code: "NOT_FOUND", message: `${method} ${path}` }, 404);
	};

	return { fetch: fetch as typeof globalThis.fetch, entries, terms, media, published, requests };
}

const quiet = { log: () => {} };

function ghost(site: ReturnType<typeof fakeSite>, extra: Record<string, unknown> = {}) {
	return runImport(
		{ source: "ghost", file: GHOST, url: SITE, token: "ec_pat_test", siteUrl: OLD_GHOST, ...extra },
		{ ...quiet, fetch: site.fetch },
	);
}

describe("ghost import", () => {
	it("creates drafts with images, tags and SEO", async () => {
		const site = fakeSite();
		const summary = await ghost(site);

		expect(summary.failed).toEqual([]);
		expect(summary.created.sort()).toEqual([
			"pages/about",
			"posts/hello-ghost",
			"posts/lexical-draft",
			"posts/members-only",
		]);
		expect(site.published).toEqual([]);

		const hello = site.entries.get("posts/hello-ghost")!;
		const data = hello["data"] as Record<string, unknown>;
		expect(data["title"]).toBe("Hello Ghost");
		const image = (data["content"] as Record<string, unknown>[]).find(
			(b) => b["_type"] === "image",
		)!;
		expect(image["asset"]).toEqual({
			_type: "reference",
			_ref: "m1",
			url: "/_emdash/api/media/file/m1.png",
		});
		expect(data["featured_image"]).toMatchObject({
			provider: "local",
			id: "m2",
			meta: { storageKey: "m2.png" },
		});
		expect(site.media.map((m) => m.filename)).toEqual(["a.png", "cover.jpg"]);
		expect(hello["seo"]).toEqual({
			title: "Hello SEO title",
			description: "Hello SEO description",
		});
		expect(hello["taxonomies"]).toMatchObject({ tag: expect.arrayContaining(["news"]) });
		expect(site.terms.get("tag")!.has("news")).toBe(true);
		expect(hello["publishedAt"]).toBeTruthy();
		expect(site.entries.get("posts/lexical-draft")!["publishedAt"]).toBeUndefined();
		expect(site.entries.get("pages/about")!["seo"]).toEqual({ title: "About us" });
	});

	it("sends auth and CSRF headers on writes", async () => {
		const site = fakeSite();
		await ghost(site);
		const write = site.requests.find((r) => r.method === "POST")!;
		expect(write.headers).toMatchObject({
			Authorization: "Bearer ec_pat_test",
			"X-EmDash-Request": "1",
			Origin: SITE,
		});
	});

	it("skips everything on a second run", async () => {
		const site = fakeSite();
		await ghost(site);
		const second = await ghost(site);
		expect(second.created).toEqual([]);
		expect(second.skipped).toHaveLength(4);
		expect(site.entries.size).toBe(4);
		expect(site.media).toHaveLength(2);
	});

	it("publishes only source-published items with --publish", async () => {
		const site = fakeSite();
		await ghost(site, { publish: true });
		const ids = (slug: string) => site.entries.get(slug)!["id"];
		expect(site.published.sort()).toEqual(
			[ids("posts/hello-ghost"), ids("posts/members-only"), ids("pages/about")].sort(),
		);
	});

	it("writes nothing on a dry run", async () => {
		const site = fakeSite();
		await ghost(site, { dryRun: true });
		expect(site.requests.filter((r) => r.method !== "GET")).toEqual([]);
	});

	it("stops when the collection lacks the body field", async () => {
		const site = fakeSite({ posts: [{ slug: "title", type: "string" }] });
		await expect(ghost(site)).rejects.toThrow(ImportError);
		await expect(ghost(site)).rejects.toThrow(/no "content" field/);
	});

	it("uses --field for the body", async () => {
		const site = fakeSite({
			posts: [
				{ slug: "title", type: "string" },
				{ slug: "body", type: "portableText" },
			],
		});
		const summary = await ghost(site, { field: "body" });
		expect(summary.created).toContain("posts/hello-ghost");
		expect(
			(site.entries.get("posts/hello-ghost")!["data"] as Record<string, unknown>)["body"],
		).toBeInstanceOf(Array);
	});

	it("skips pages when there is no pages collection", async () => {
		const site = fakeSite({ posts: BLOG_FIELDS });
		const summary = await ghost(site);
		expect(summary.created).not.toContain("pages/about");
		expect(summary.failed).toEqual([]);
	});

	it("reports failed entries and counts slug conflicts as skipped", async () => {
		const raw = JSON.parse(readFileSync(GHOST, "utf8"));
		const posts = raw.db[0].data.posts;
		posts[1].slug = "taken";
		posts[3].slug = "explodes";
		const dir = mkdtempSync(join(tmpdir(), "plugdash-import-"));
		const file = join(dir, "export.json");
		writeFileSync(file, JSON.stringify(raw));

		const site = fakeSite();
		const summary = await runImport(
			{ source: "ghost", file, url: SITE, token: "t", siteUrl: OLD_GHOST },
			{ ...quiet, fetch: site.fetch },
		);
		expect(summary.skipped).toEqual(["posts/taken"]);
		expect(summary.failed).toEqual([{ slug: "posts/explodes", reason: "boom" }]);
	});

	it("keeps the post when an image cannot be downloaded", async () => {
		const site = fakeSite();
		const summary = await ghost(site, { siteUrl: undefined });
		expect(summary.failed).toEqual([]);
		expect(summary.warnings.some((w) => w.includes("--site-url"))).toBe(true);
		expect(site.media).toEqual([]);
	});
});

describe("substack import", () => {
	function substackZip(): string {
		const dir = join(FIXTURES, "substack");
		// Real exports use "140001.hello-world" as post_id. fromsubstack on main
		// only pairs a bare "140001" with its HTML file (fixed in #18), so trim
		// the id to keep this test about the CLI, not the source.
		const csv = readFileSync(join(dir, "posts.csv"), "utf8").replace(/^(\d+)\.[^,]+,/gm, "$1,");
		const files: Record<string, Uint8Array> = { "posts.csv": new TextEncoder().encode(csv) };
		for (const name of readdirSync(join(dir, "posts"))) {
			files[`posts/${name}`] = readFileSync(join(dir, "posts", name));
		}
		const file = join(mkdtempSync(join(tmpdir(), "plugdash-import-")), "export.zip");
		writeFileSync(file, zipSync(files));
		return file;
	}

	it("imports posts and is idempotent", async () => {
		const site = fakeSite();
		const file = substackZip();
		const opts = { source: "substack" as const, file, url: SITE, token: "t" };
		const first = await runImport(opts, { ...quiet, fetch: site.fetch });
		expect(first.failed).toEqual([]);
		expect(first.created).toContain("posts/hello-world");
		expect(site.entries.get("posts/hello-world")!["publishedAt"]).toBeTruthy();

		const second = await runImport(opts, { ...quiet, fetch: site.fetch });
		expect(second.created).toEqual([]);
		expect(second.skipped).toEqual(first.created);
	});
});
