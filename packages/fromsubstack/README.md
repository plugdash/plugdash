# @plugdash/fromsubstack

Migrate from Substack to EmDash in minutes. Registers Substack as an import
source in EmDash's admin importer: upload the export ZIP you get from
Substack's Settings > Exports, and this plugin reads `posts.csv` plus each
post's HTML, converts bodies to Portable Text, and reports images so EmDash
can bring them in too.

## Install

```bash
pnpm add @plugdash/fromsubstack
```

## Register

```js
// astro.config.mjs
import { defineConfig } from "astro/config";
import emdash from "emdash/astro";
import { fromsubstackPlugin } from "@plugdash/fromsubstack";

export default defineConfig({
  integrations: [
    emdash({
      plugins: [fromsubstackPlugin()],
    }),
  ],
});
```

The plugin registers a Substack import source (`createSubstackSource()`).
EmDash 0.41 and 1.0 have no import screen for sources other than WordPress,
so drive the source from your own script until the admin UI supports it.
Remove the plugin after the import.

## Configuration

Pass options to `fromsubstackPlugin()`:

```js
fromsubstackPlugin({
  targetCollection: "newsletter",
  status: "published",
  importImages: true,
  preserveSlugs: true,
  paidPostsAs: "draft",
});
```

| Option           | Type                      | Default   | Description                                          |
| ---------------- | ------------------------- | --------- | ----------------------------------------------------- |
| targetCollection | `string`                  | `"posts"` | Collection posts import into                          |
| status           | `"draft" \| "published"`  | `"draft"` | Status for posts Substack had marked published        |
| importImages     | `boolean`                 | `true`    | Report body images so EmDash imports them              |
| preserveSlugs    | `boolean`                 | `true`    | Keep the slug from the Substack post URL                |
| paidPostsAs      | `"draft" \| "publish" \| "skip"` | `"draft"` | What to do with paid posts (`only_paid`, `founding`). Applied even when `status` is `"published"` |

Warnings (skipped rows, empty bodies) are returned as `warnings` on the
`analyze()` result and logged with `console.warn` during `fetchContent()`.

`status` defaults to draft on purpose - review imported posts before they go
live. A post that was still a draft on Substack always imports as a draft,
no matter what `status` is set to.

## What gets imported

From each row in `posts.csv` with a matching HTML file:

- Title, subtitle (as excerpt), publish date, and slug (from the post's
  Substack URL, or re-slugified from the title if `preserveSlugs: false`)
- The body, converted from HTML to Portable Text - headings, bold/italic,
  links, images, blockquotes, fenced code with language detection, and lists
- The first body image as the featured image
- Substack boilerplate is dropped: the subscribe widget, subscribe buttons,
  share and comment bars, and footnote anchors (footnote text stays)
- Paid/subscriber-only status, recorded in metadata (`meta.substackPaid`,
  `meta.substackAudience`) rather than hidden - EmDash doesn't have a native
  concept of a Substack paywall, so this is left for you to act on

Podcast episodes and other non-article post types in the export are skipped
with a warning - there's no article body to convert. A CSV row with no
matching HTML file, or a slug that collides with one already imported, is
also skipped with a warning rather than failing the whole run.

## What it does not do

- Does not create content on its own - it's a source for EmDash's importer,
  which does the actual writing
- Does not guarantee pixel-perfect HTML - unknown tags are unwrapped and
  their text kept, not preserved as-is
- Does not resolve Substack's paywall into an EmDash paywall - see
  [@plugdash/paygate](../paygate) if you need one
- Does not deduplicate against posts already in EmDash from a previous,
  different import path - only duplicates within the same export are caught
