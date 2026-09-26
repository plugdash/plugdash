# @plugdash/fromghost

Imports a Ghost JSON export (Settings > Labs > Export your content) into EmDash.
Registers a Ghost source with EmDash's own import screen, next to the built-in
WordPress importers, so posts, pages, tags and authors show up there with no
separate CLI step.

## Install

```bash
pnpm add @plugdash/fromghost
```

## Register

```js
// astro.config.mjs
import { defineConfig } from "astro/config";
import emdash from "emdash";
import { fromghostPlugin } from "@plugdash/fromghost";

export default defineConfig({
  integrations: [
    emdash({
      plugins: [fromghostPlugin()], // must be plugins, not sandboxed - needs Node fs/JSON
    }),
  ],
});
```

Once registered, "Ghost Export File" appears as a source in EmDash's admin
import screen (`/_emdash/admin/import`). Upload the export, review the
analysis, and run the import - the rest of the pipeline (schema checks, media
download, content creation) is EmDash's own.

## Config options

Passed to `fromghostPlugin({ ... })`:

| Option           | Type      | Default   | Description                                          |
| ---------------- | --------- | --------- | ----------------------------------------------------- |
| targetCollection | `string`  | `"posts"` | Collection suggested for Ghost posts                  |
| status           | n/a       | -         | Not configurable - status comes from each post's own Ghost status (see below) |
| preserveSlugs    | `boolean` | `true`    | Keep Ghost's slugs instead of regenerating from title  |
| importImages     | `boolean` | `true`    | Carry feature and inline images over                   |
| importTags       | `boolean` | `true`    | Carry Ghost tags over as taxonomy terms                |
| siteUrl          | `string`  | `""`      | The Ghost site's URL, to resolve `__GHOST_URL__` image paths |
| onWarn           | `(message: string) => void` | discard | Called for every recoverable problem during import |

`siteUrl` matters: Ghost writes feature and inline images as
`__GHOST_URL__/content/images/...` rather than an absolute URL. Without
`siteUrl` those stay site-relative and are skipped (the import continues,
just without that image) rather than guessed at.

Import status (draft vs. published) is not a plugin setting - it is read
straight from each post's own Ghost status via `fetchContent`'s
`includeDrafts` option, which EmDash's import screen controls.

## Field mapping

| Ghost field                          | EmDash field                          |
| ------------------------------------- | -------------------------------------- |
| `title`                                | `title`                                 |
| `slug`                                 | `slug` (or regenerated, see `preserveSlugs`) |
| `html`                                 | `content`, via `htmlToPortableText`     |
| `custom_excerpt` (falls back to `excerpt`) | `excerpt`                          |
| `feature_image`                        | `featuredImage` (after `__GHOST_URL__` resolution) |
| `published_at` (falls back to `created_at`) | `date`                             |
| `updated_at`                           | `modified`                              |
| `meta_title`                           | `meta.seoTitle`                         |
| `meta_description`                     | `meta.seoDescription`                   |
| tags via `posts_tags`                  | `tags` (public tags only)               |
| author via `posts_authors`             | `author` (first author's slug)          |

## What it does

- Parses Ghost's `{ db: [{ meta, data }] }` export shape, and the looser
  `{ data }` / `{ posts }` shapes some third-party exporters use
- Handles both Ghost 5 (`type: "post" | "page"`) and Ghost 4 (`page: boolean`)
  post-type flags
- Converts post body HTML to Portable Text via the same shared
  `@plugdash/html-to-portable-text` converter `fromsubstack` uses
- Falls back to a plain-text recovery of Ghost 5 Lexical drafts that were
  never rendered to HTML (`html: null`), and warns when it does
- Resolves tags and the primary author through the `posts_tags` /
  `posts_authors` join tables, in Ghost's own sort order
- Skips duplicate slugs (keeping the first occurrence) and warns
- Skips a feature image that cannot be resolved to an absolute URL and warns,
  rather than failing the whole post
- Reports post/page counts, tag counts, and attachment counts through
  EmDash's standard `ImportAnalysis`, so the admin's preview screen works
  without any Ghost-specific UI

## What it does not do

- Does not convert Mobiledoc (Ghost 3 and older editor format) - such posts
  import with an empty body and a warning
- Does not download or upload media itself - `featuredImage` is handed to
  EmDash's import pipeline as a URL, which owns the actual download
- Does not import Ghost members, newsletters, or comments
- Does not preserve Ghost's internal tags (`visibility: "internal"`) as
  taxonomy - those are Ghost's own bookkeeping
- Cannot be sandboxed - JSON parsing this size needs Node, and the plugin
  registers directly into EmDash's import-source registry
