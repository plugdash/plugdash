#!/usr/bin/env node
import { parseArgs } from "node:util";
import { ApiError } from "./api.ts";
import { ImportError, runImport, type SourceName } from "./import.ts";

const USAGE = `Usage:
  plugdash-import ghost <export.json> --url <site> --token <token> [--site-url <old ghost site>]
  plugdash-import substack <export.zip> --url <site> --token <token>

Options:
  --url <url>          EmDash site to import into (or EMDASH_URL)
  --token <token>      API token with content, media and schema scopes (or EMDASH_TOKEN)
  --cookie <cookie>    Session cookie instead of a token, for local dev sites
  --site-url <url>     Ghost only: the old site, to download __GHOST_URL__ images
  --collection <slug>  Collection for posts (default: posts)
  --field <slug>       Portable Text field for the body (default: content)
  --dry-run            Show what would be imported, write nothing
  --publish            Publish posts that were published at the source (default: drafts)
  --paid-posts-as <draft|publish>
                       What --publish does with paid posts (default: draft)
  -h, --help           Show this help`;

async function main(argv: string[]): Promise<number> {
	let parsed;
	try {
		parsed = parseArgs({
			args: argv,
			allowPositionals: true,
			options: {
				url: { type: "string" },
				token: { type: "string" },
				cookie: { type: "string" },
				"site-url": { type: "string" },
				collection: { type: "string" },
				field: { type: "string" },
				"dry-run": { type: "boolean" },
				publish: { type: "boolean" },
				"paid-posts-as": { type: "string" },
				help: { type: "boolean", short: "h" },
			},
		});
	} catch (error) {
		console.error(`${(error as Error).message}\n\n${USAGE}`);
		return 1;
	}
	const { values, positionals } = parsed;
	if (values.help) {
		console.log(USAGE);
		return 0;
	}

	const [source, file] = positionals;
	const url = values.url ?? process.env["EMDASH_URL"];
	const token = values.token ?? process.env["EMDASH_TOKEN"];
	if ((source !== "ghost" && source !== "substack") || !file || !url) {
		console.error(USAGE);
		return 1;
	}
	const paidPostsAs = values["paid-posts-as"] ?? "draft";
	if (paidPostsAs !== "draft" && paidPostsAs !== "publish") {
		console.error(`--paid-posts-as must be "draft" or "publish", got "${paidPostsAs}"`);
		return 1;
	}
	if (!token && !values.cookie) {
		console.error("Missing --token (or EMDASH_TOKEN). See the README for how to create one.");
		return 1;
	}

	try {
		const summary = await runImport({
			source: source as SourceName,
			file,
			url,
			token,
			cookie: values.cookie,
			siteUrl: values["site-url"],
			collection: values.collection,
			field: values.field,
			dryRun: values["dry-run"],
			publish: values.publish,
			paidPostsAs,
		});
		return summary.failed.length > 0 ? 1 : 0;
	} catch (error) {
		if (error instanceof ApiError && error.status === 401) {
			console.error("The site rejected the token (401). Check --token and its scopes.");
		} else if (error instanceof ImportError || error instanceof ApiError) {
			console.error(error.message);
		} else if (error instanceof TypeError && error.message === "fetch failed") {
			console.error(`Could not reach ${url}: ${(error.cause as Error)?.message ?? error.message}`);
		} else {
			console.error(error);
		}
		return 1;
	}
}

process.exitCode = await main(process.argv.slice(2));
