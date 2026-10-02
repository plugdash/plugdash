# @plugdash/fromghost

Imports a Ghost JSON export (Settings > Labs > Export your content) into EmDash.
Registers a Ghost import source with EmDash's import registry, so posts, pages,
tags and authors go through EmDash's own media download, taxonomy and
content-creation pipeline.

EmDash's admin import screen only lists WordPress sources, so "Ghost Export
File" does not appear there. Run the import through a script or the import
API. Remove the plugin after the import.

## Install

```bash
pnpm add @plugdash/fromghost
```

## Register

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

Options are passed to `createPlugin(options)` in the server runtime, so they
are active in a production build.

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
| paidPostsAs      | `"draft" \| "publish" \| "skip"` | `"draft"` | Posts with Ghost visibility `members`, `paid` or `tiers`. The export holds their full body, so the default keeps them off the public site. `meta.visibility` is recorded either way |

`siteUrl` matters: Ghost writes images and links as `__GHOST_URL__/...`
rather than an absolute URL. With `siteUrl` set, every placeholder in the
post HTML is replaced before conversion, and inline images are listed in the
analysis attachments so EmDash downloads them. Without it, site-relative
feature images are skipped (the import continues without them).

Recoverable problems (Lexical-only drafts, duplicate slugs, unresolved images)
are returned as `warnings` on the analysis. emdash 1.0.1's `ImportAnalysis`
type has no warnings field, so this is an extra property on the object.

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
- Reports post/page counts, tag counts, attachment counts (feature and inline
  images) and warnings through `ImportAnalysis`
- Loads the HTML converter (and `linkedom`) only when an import runs, so
  having the plugin registered costs nothing at startup

## What it does not do

- Does not convert Mobiledoc (Ghost 3 and older editor format) - such posts
  import with an empty body and a warning
- Does not download or upload media itself - `featuredImage` is handed to
  EmDash's import pipeline as a URL, which owns the actual download
- Does not import Ghost members, newsletters, or comments
- Does not preserve Ghost's internal tags (`visibility: "internal"`) as
  taxonomy - those are Ghost's own bookkeeping
- Cannot be sandboxed - it registers directly into EmDash's import-source registry
- Does not appear in the admin import screen (WordPress only in emdash 1.0.1)
