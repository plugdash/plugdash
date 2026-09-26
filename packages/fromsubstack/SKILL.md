---
name: fromsubstack
description: Substack import plugin for EmDash. Registers Substack as an import source that reads an export ZIP and yields posts for the admin importer to create.
---

# @plugdash/fromsubstack

Registers Substack as an import source for EmDash's built-in importer. Reads the export ZIP (`posts.csv` plus per-post HTML and an attachments folder), converts each post's HTML body to Portable Text, and streams normalized items for the host to create. Marks paywalled and draft posts in metadata rather than guessing at access rules.

## Plugin type

Native (registers an import source and unzips a file in memory - needs direct host access, cannot be sandboxed)

## Capabilities declared

```
content:write
media:write
```

## What it registers

An `ImportSource` with id `substack`. It does not create content itself - EmDash's importer calls `analyze()` to preview the export, then `fetchContent()` to stream posts and `fetchMedia()` to pull image bytes.

## Install

```bash
pnpm add @plugdash/fromsubstack
```

## Register

```js
// astro.config.mjs
import { defineConfig } from "astro/config";
import emdash from "emdash";
import { fromsubstackPlugin } from "@plugdash/fromsubstack";

export default defineConfig({
  integrations: [
    emdash({
      plugins: [fromsubstackPlugin()],
    }),
  ],
});
```

Once registered, "Substack" appears as an import source in EmDash's admin importer. The person doing the import uploads the export ZIP there; this plugin never touches the filesystem or a CLI.

## Configuration

| Option           | Type                      | Default    | Description                                      |
| ---------------- | ------------------------- | ---------- | ------------------------------------------------- |
| targetCollection | `string`                  | `"posts"`  | Collection the importer is told to create posts in |
| status           | `"draft" \| "published"`  | `"draft"`  | Status for posts Substack marked as published      |
| importImages     | `boolean`                 | `true`     | Report body images as attachments to import        |
| preserveSlugs    | `boolean`                 | `true`     | Keep Substack's URL slug instead of re-slugifying the title |
| onWarn           | `(message: string) => void` | `console.warn` | Where per-post warnings go                    |

`status` only governs posts Substack itself marked published. A post still in draft on Substack always imports as a draft, regardless of this setting - the "safer default" from the export status is source of truth for its own unpublished posts.

## What it does not do

- Does not write to the target collection itself - the host importer creates content from the items this source yields
- Does not download images - it reports their URLs (and serves their bytes via `fetchMedia`) and lets the importer decide whether and where to store them
- Does not preserve Substack's exact HTML - runs it through `@plugdash/html-to-portable-text`, which keeps headings, marks, links, images, blockquotes, code blocks and lists but drops unknown tags (keeping their text)
- Does not import podcast episodes or threads - Substack's CSV lists these as post types, and they have no article body to convert
- Does not detect paywall status with certainty beyond what the export's `audience` column reports - `substackPaid` in metadata reflects that column, not a live subscription check

## For agents

After installing @plugdash/fromsubstack and registering it in astro.config.mjs:

1. Confirm the plugin shows up as "Substack" in the admin importer's source list.
2. Have the user download their export from Substack (Settings > Exports) and upload the ZIP there.
3. Review the analysis: post count, attachment count, and whether the target collection's schema can take the import (`schemaStatus.canImport`). If it's `false`, `schemaStatus.reason` names the missing or mismatched field.
4. Run the import. Metadata written per post:
   - `meta.substackId` - the original Substack post id
   - `meta.substackUrl` - the original post URL
   - `meta.substackAudience` - the raw `audience` value from the export (`everyone`, `only_paid`, `founding`, etc.)
   - `meta.substackPaid` - `true` when `substackAudience` is anything other than `everyone`
   - `meta.substackSubtitle` - the post's subtitle, if any
5. If a post is missing after import, check the warnings the host surfaced - a duplicate slug, a CSV row with no matching HTML file, or a non-post type are all skipped rather than failing the whole import.
