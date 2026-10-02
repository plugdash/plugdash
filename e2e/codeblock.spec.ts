import { execFileSync } from "node:child_process";
import { test, expect, type APIRequestContext } from "@playwright/test";
import { highlightCode } from "../packages/codeblock/src/highlight.ts";
import { resolveOptions } from "../packages/codeblock/src/key.ts";

// Functional test for @plugdash/codeblock pre-highlighting.
//
// Code blocks are highlighted once, in content:beforeSave, and the HTML is
// stored on the node. A fresh server should render a saved post without ever
// building a Shiki highlighter. To prove "fresh", this spec runs its own
// `astro dev` and restarts it, so it needs a site directory rather than a
// URL:
//
//   CODEBLOCK_SITE=/path/to/emdash-site \
//   CODEBLOCK_PORT=5130 \
//   CODEBLOCK_CONFIG='{"theme":"nord"}' \
//   pnpm playwright test e2e/codeblock.spec.ts
//
// The site must register codeblockPlugin(CODEBLOCK_CONFIG) in astro.config.mjs,
// have a `posts` collection with a Portable Text `content` field, and render
// it at /posts/<slug>. Plain Playwright for now; move the server handling to
// the e2e/harness helpers once card #04 lands.

const SITE = process.env.CODEBLOCK_SITE;
const PORT = process.env.CODEBLOCK_PORT ?? "4321";
const CONFIG = JSON.parse(process.env.CODEBLOCK_CONFIG ?? "{}");
const BASE = `http://127.0.0.1:${PORT}`;
const BUILD_LINE = "[codeblock] building Shiki highlighter";

const BLOCKS = [
	{ language: "ts", code: "const answer: number = 42;" },
	{ language: "js", code: "export default function add(a, b) {\n\treturn a + b;\n}" },
	{ language: "python", code: "def greet(name):\n    return f'hi {name}'" },
	{ language: "html", code: "</code><script>alert(1)</script>" },
	{ language: "bash", code: "pnpm add @plugdash/codeblock" },
];

// Astro 7 runs `astro dev` in the background when stdout is not a TTY, so
// drive it through its own start/stop/logs subcommands.
const astro = (...args: string[]) =>
	execFileSync("pnpm", ["astro", "dev", ...args], { cwd: SITE, encoding: "utf8" });

async function startServer() {
	astro("--background", "--host", "127.0.0.1", "--port", PORT);
	for (let i = 0; i < 120; i++) {
		if (await fetch(BASE).then(() => true, () => false)) return;
		await new Promise((r) => setTimeout(r, 500));
	}
	throw new Error(`astro dev did not come up on ${BASE}:\n${astro("logs")}`);
}

function stopServer() {
	try {
		astro("stop");
	} catch {
		// not running
	}
}

const logs = () => astro("logs");
const builds = () => logs().split(BUILD_LINE).length - 1;

async function api(request: APIRequestContext, method: "post" | "get", path: string, data?: unknown) {
	const res = await request[method](`${BASE}/_emdash/api${path}`, {
		headers: { "X-EmDash-Request": "1" },
		data,
	});
	expect(res.ok(), `${method} ${path}: ${res.status()}`).toBe(true);
	return res.json();
}

test.describe("codeblock pre-highlighting", () => {
	test.skip(!SITE, "set CODEBLOCK_SITE to an EmDash site with codeblock registered");
	test.setTimeout(180_000);
	test.afterAll(stopServer);

	test("a saved post renders in a fresh process with no highlighter build", async ({
		page,
		request,
	}) => {
		await startServer();
		await request.get(`${BASE}/_emdash/api/setup/dev-bypass`);

		const slug = `codeblock-e2e-${Date.now()}`;
		const content = BLOCKS.map((b, i) => ({ _type: "code", _key: `c${i}`, ...b }));
		const created = await api(request, "post", "/content/posts", {
			data: { title: "codeblock e2e", content },
			slug,
		});
		const item = created.data?.item ?? created.item ?? created.data ?? created;
		const saved = item.data.content as { pdHighlight?: { key: string } }[];
		expect(saved.filter((n) => n.pdHighlight?.key)).toHaveLength(BLOCKS.length);
		await api(request, "post", `/content/posts/${item.id}/publish`, {});

		stopServer();
		await startServer();
		const before = builds();

		await page.goto(`${BASE}/posts/${slug}`);
		await expect(page.locator("pre.shiki")).toHaveCount(BLOCKS.length);
		// Raw response body: page.content() re-serializes and changes entity escapes.
		const html = await (await request.get(`${BASE}/posts/${slug}`)).text();
		expect(builds() - before, logs()).toBe(0);

		// The stored HTML must be exactly what a render-time highlight produces.
		const options = resolveOptions(CONFIG);
		for (const b of BLOCKS) {
			expect(html).toContain(await highlightCode(b.code, b.language, options));
		}
		expect(html).not.toContain("<script>alert(1)</script>");
	});
});
