import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { api, block, createPost, publish, ROOT } from "./harness";

// Every public package with a main entry is registered by setup.sh.
const pluginIds = readdirSync(join(ROOT, "packages"))
	.map((dir) => JSON.parse(readFileSync(join(ROOT, "packages", dir, "package.json"), "utf8")))
	.filter((p) => !p.private && p.exports?.["."])
	.map((p) => String(p.name).replace("@plugdash/", ""));

test("site home page responds @prod", async ({ request }) => {
	const res = await request.get("/");
	expect(res.status()).toBe(200);
});

test.describe("admin plugin list @prod", () => {
	let items: Array<{ id: string; status: string }> = [];
	test.beforeAll(async () => {
		const res = await api("GET", "/_emdash/api/admin/plugins");
		expect(res.status).toBe(200);
		items = res.data.items;
	});

	for (const id of pluginIds) {
		test(`${id} is active`, () => {
			expect(items.find((p) => p.id === id)?.status).toBe("active");
		});
	}
});

test("post page with every companion component has no console errors @prod", async ({ page }) => {
	const post = await createPost({
		title: "Smoke post",
		blocks: [
			block("Getting started", "h2"),
			"Some words to read.",
			block("Details", "h3"),
			"More words.",
		],
	});
	await publish(post.id);

	const errors: string[] = [];
	page.on("console", (msg) => {
		if (msg.type() === "error") errors.push(msg.text());
	});
	page.on("pageerror", (err) => errors.push(err.message));

	const res = await page.goto(`/posts/${post.slug}`);
	expect(res?.status()).toBe(200);
	await page.waitForLoadState("networkidle");
	for (const id of ["pd-readtime", "pd-toc", "pd-share", "pd-heart", "pd-copy", "pd-engage"]) {
		await expect(page.locator(`#${id}`)).toHaveCount(1);
	}
	expect(errors).toEqual([]);
});
