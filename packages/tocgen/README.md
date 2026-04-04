# @plugdash/tocgen

Long posts need navigation. Readers scroll past the fold and lose track of
where they are. `@plugdash/tocgen` parses headings from Portable Text content
on publish and writes a nested table of contents structure to metadata. Ships
`TableOfContents.astro` - a sticky sidebar nav that works with zero config.
The EmDash equivalent of [Table of Contents Plus](https://wordpress.org/plugins/table-of-contents-plus/).

## Install

```bash
pnpm add @plugdash/tocgen
```

## Register

```js
// astro.config.mjs
import { defineConfig } from "astro/config";
import emdash from "emdash";
import { tocgenPlugin } from "@plugdash/tocgen";

export default defineConfig({
  integrations: [
    emdash({
      plugins: [tocgenPlugin()],
      // or sandboxed: [tocgenPlugin()]
    }),
  ],
});
```

## Config options

Configuration is stored in the plugin's KV store and can be changed via the
admin UI or programmatically. Defaults are seeded on install.

| Option       | Type       | Default | Description                                           |
| ------------ | ---------- | ------- | ----------------------------------------------------- |
| minHeadings  | `number`   | `3`     | Minimum headings required to generate a TOC            |
| maxDepth     | `2\|3\|4`  | `3`     | Deepest heading level to include (2=h2, 3=h2+h3, etc) |
| collections  | `string[]` | all     | Limit processing to specific collection slugs          |

## Companion component

```astro
---
import TableOfContents from "@plugdash/tocgen/TableOfContents.astro";
const post = await emdash.content.get("posts", Astro.params.id);
---

<TableOfContents post={post} />
```

### Props

| Prop     | Type        | Default | Description                    |
| -------- | ----------- | ------- | ------------------------------ |
| post     | `object`    | -       | The post object (required)     |
| maxDepth | `2\|3\|4`   | `3`     | How deep to render the tree    |
| sticky   | `boolean`   | `false` | Enable sticky positioning      |
| class    | `string`    | `""`    | Additional CSS class           |

### CSS custom properties

| Property                     | Default                | Description              |
| ---------------------------- | ---------------------- | ------------------------ |
| `--plugdash-toc-size`        | `0.875rem`             | Font size                |
| `--plugdash-toc-line-height` | `1.6`                  | Line height              |
| `--plugdash-toc-indent`      | `1rem`                 | Nested list padding      |
| `--plugdash-toc-color`       | `inherit`              | Link color               |
| `--plugdash-toc-hover`       | `#6366f1`              | Link hover color         |
| `--plugdash-toc-top`         | `2rem`                 | Sticky offset from top   |
| `--plugdash-toc-max-height`  | `calc(100vh - 4rem)`   | Sticky container max-height |

### Sticky sidebar example

```astro
<div class="post-layout">
  <aside>
    <TableOfContents post={post} sticky />
  </aside>
  <article set:html={renderedBody} />
</div>

<style>
  .post-layout {
    display: grid;
    grid-template-columns: 240px 1fr;
    gap: 2rem;
  }
</style>
```

## What it does

- Fires on `content:afterSave` when status is `published`
- Extracts h2, h3, and h4 headings from Portable Text body
- Generates collision-safe anchor slugs (duplicates get `-2`, `-3` suffixes)
- Builds a nested tree structure (h3s nest under h2s, h4s under h3s)
- Skips posts with fewer than `minHeadings` headings (no TOC for short posts)
- Writes `tocgen` to content metadata with entries and generatedAt timestamp
- Preserves existing metadata keys from other plugins
- Cleans up stale `tocgen` metadata when headings drop below the threshold

## What it does not do

- Does not inject anchor IDs into the rendered HTML - your theme's Portable Text renderer handles that
- Does not process drafts, archived, or scheduled content
- Does not extract headings from non-Portable-Text content
- Does not render active/highlight state for the current section (add scroll-spy in your theme JS)
- Does not include h1 headings (h1 is the post title, not a section heading)
- Does not generate a flat list option - output is always a nested tree
