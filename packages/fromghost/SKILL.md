---
name: fromghost
description: Ghost JSON export importer. Native plugin registering an ImportSource so posts, pages, tags and authors from a Ghost export go through EmDash's import pipeline.
---

# @plugdash/fromghost

## what it does

Parses a Ghost JSON export (Settings > Labs > Export your content) and
registers it as a source in EmDash's `ImportSource` registry (the admin
import screen only lists WordPress, so drive it by script or API). Converts post bodies to Portable Text via
the shared `@plugdash/html-to-portable-text` converter.

## plugin type

Native

## capabilities declared

```
content:write
media:write
```

Note: Spec 12 originally named `write:content`, `write:media`, `read:schema`.
The real `PluginCapability` union in `@plugdash/types` uses `content:write` /
`media:write` (those older forms are deprecated aliases), and `read:schema`
does not exist in the union at all, so it was dropped.

## hooks

None. Pure `ImportSource` registration - no `definePlugin` hooks are used for
the actual work, only to satisfy the plugin descriptor shape.

## install

```bash
pnpm add @plugdash/fromghost
```

## register

```js
// astro.config.mjs
import { defineConfig } from "astro/config";
import emdash from "emdash/astro";
import { fromghostPlugin } from "@plugdash/fromghost";

export default defineConfig({
	integrations: [
		emdash({
			plugins: [fromghostPlugin({ siteUrl: "https://blog.example.com" })],
		}),
	],
});
```

`fromghostPlugin(config)` only returns the descriptor. The source is registered
in `createPlugin(options)` at runtime, with the options inlined as JSON, so
config works in production. Remove the plugin after the import.

## configuration

| Option             | Type                             | Default   | Description                                      |
| ------------------ | -------------------------------- | --------- | ------------------------------------------------ |
| `targetCollection` | `string`                         | `"posts"` | Collection suggested for Ghost posts             |
| `preserveSlugs`    | `boolean`                        | `true`    | Keep Ghost's slugs instead of regenerating       |
| `importImages`     | `boolean`                        | `true`    | Carry feature and inline images over             |
| `importTags`       | `boolean`                        | `true`    | Carry Ghost tags over as taxonomy terms          |
| `siteUrl`          | `string`                         | `""`      | Ghost site URL, to resolve `__GHOST_URL__` paths |
| `paidPostsAs`      | `"draft" \| "publish" \| "skip"` | `"draft"` | Posts with visibility members/paid/tiers         |

Warnings come back as `warnings: string[]` on the analysis.

## what it does not do

- No Mobiledoc conversion (Ghost 3 and older editor format) - imports with
  an empty body and a warning
- No media download/upload - `featuredImage` is a URL handed to EmDash's own
  import pipeline
- No members, newsletters, or comments import
- No preservation of Ghost's internal (`visibility: "internal"`) tags
- Cannot be sandboxed - needs Node JSON parsing and registers directly into
  EmDash's import-source registry

## for agents

After installing @plugdash/fromghost and registering it in astro.config.mjs:

1. The source is not in the admin import screen (WordPress only). Call the
   source's `analyze()` / `fetchContent()` from a script, or wait for the CLI.

2. To verify, run `analyze()` on the export and check the post/page/tag counts
   and `warnings`, then import and check the created content.

3. If images don't resolve, confirm `siteUrl` is set in
   `fromghostPlugin({ siteUrl: "https://yoursite.com" })`. Placeholders are
   replaced in post HTML and inline images are listed as attachments.

4. Paid and members posts import as drafts unless `paidPostsAs` says otherwise.

5. If a post's body is empty, check `analysis.warnings` for a Mobiledoc or
   Lexical warning.

Metadata written: none (import source only, no persistent plugin state)
Source id: `ghost`
Exports: `fromghostPlugin`, `createGhostSource`, `ghostSource`, plus the
`ghost-export.ts` parsing helpers (`parseGhostExport`, `mapGhostStatus`, etc.)
