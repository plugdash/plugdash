import { defineConfig } from "astro";
import emdash from "emdash/astro";
import { sqlite } from "emdash/db";
import { readtimePlugin } from "@plugdash/readtime";
import { calloutPlugin } from "@plugdash/callout";
import { shortlinkPlugin } from "@plugdash/shortlink";
import { sharepostPlugin } from "@plugdash/sharepost";
import { heartpostPlugin } from "@plugdash/heartpost";
import { tocgenPlugin } from "@plugdash/tocgen";

export default defineConfig({
	integrations: [
		emdash({
			database: sqlite({ file: "./.testbed/db.sqlite" }),
			plugins: [
				readtimePlugin({ collections: ["posts"] }),
				calloutPlugin(),
				shortlinkPlugin({ autoCreate: true }),
				sharepostPlugin(),
				heartpostPlugin(),
				tocgenPlugin({ collections: ["posts"] }),
			],
		}),
	],
});
