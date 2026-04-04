import { defineConfig } from "astro";
import emdash from "emdash/astro";
import { sqlite } from "emdash/db";
import { readtimePlugin } from "@plugdash/readtime";
import { calloutPlugin } from "@plugdash/callout";
import { shortlinkPlugin } from "@plugdash/shortlink";

export default defineConfig({
	integrations: [
		emdash({
			database: sqlite({ file: "./.testbed/db.sqlite" }),
			plugins: [
				readtimePlugin({ collections: ["posts"] }),
				calloutPlugin(),
				shortlinkPlugin({ autoCreate: true }),
			],
		}),
	],
});
