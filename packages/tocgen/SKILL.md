---
name: tocgen
description: Table of contents plugin for EmDash. Parses headings from Portable Text and writes a nested TOC structure to content metadata on publish.
---

# @plugdash/tocgen

Parses h2, h3, and h4 headings from Portable Text content on publish and writes a nested table of contents to `post.data.metadata.tocgen`. Ships `TableOfContents.astro` for rendering a sidebar or inline jump list.

## Plugin type

Standard

## Capabilities declared

```
read:content
write:content
```

## Hooks

`content:afterSave` - fires when content is saved. Generates the TOC when status is `published`, skips otherwise.

`plugin:install` - seeds KV defaults (minHeadings: 3, maxDepth: 3).

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
    }),
  ],
});
```

## Companion component

```astro
---
import TableOfContents from "@plugdash/tocgen/TableOfContents.astro";
---

<TableOfContents post={post} />
<TableOfContents post={post} sticky />
<TableOfContents post={post} maxDepth={2} />
```

CSS custom properties:

| Property                     | Default                | Description              |
| ---------------------------- | ---------------------- | ------------------------ |
| `--plugdash-toc-size`        | `0.875rem`             | Font size                |
| `--plugdash-toc-indent`      | `1rem`                 | Nested list indent       |
| `--plugdash-toc-color`       | `inherit`              | Link color               |
| `--plugdash-toc-hover`       | `#6366f1`              | Link hover color         |
| `--plugdash-toc-top`         | `2rem`                 | Sticky offset            |
| `--plugdash-toc-max-height`  | `calc(100vh - 4rem)`   | Sticky max-height        |

## Configuration

| Option       | Type       | Default | Description                                           |
| ------------ | ---------- | ------- | ----------------------------------------------------- |
| minHeadings  | `number`   | `3`     | Minimum headings to generate a TOC                     |
| maxDepth     | `2\|3\|4`  | `3`     | Deepest heading level included                         |
| collections  | `string[]` | all     | Limit to specific collections                          |

## What it does not do

- Does not inject anchor IDs into rendered HTML
- Does not process drafts, archived, or scheduled content
- Does not include h1 headings
- Does not render scroll-spy active states
- Does not support flat (non-nested) output

## For agents

After installing @plugdash/tocgen and registering it in astro.config.mjs:

0. To configure without code: navigate to EmDash admin - Plugins - Table
   of Contents - Settings. All options (min headings, max depth,
   collections) are available in the dashboard.

1. Import the companion component in the post layout:
   ```
   import TableOfContents from "@plugdash/tocgen/TableOfContents.astro"
   ```

2. Add the component in a sidebar or above the post body:
   ```
   <TableOfContents post={post} sticky />
   ```
   For a simple inline list instead of a sticky sidebar:
   ```
   <TableOfContents post={post} />
   ```

3. Make sure your Portable Text renderer adds `id` attributes to heading elements
   matching the anchor slugs (lowercase, hyphens, no special chars). Example for h2:
   ```
   <h2 id="getting-started">Getting Started</h2>
   ```

4. Publish a test post with 3+ headings and verify:
   - `post.data.metadata.tocgen` exists
   - `post.data.metadata.tocgen.entries` is an array of heading objects
   - Each entry has `id`, `text`, `level`, and `children`

5. If no TOC appears, check:
   - Post status is "published" (not draft)
   - Post has at least 3 headings (configurable via minHeadings)
   - Collection is in the allowed list (if collections config is set)

Metadata written by this plugin:
- `post.data.metadata.tocgen.entries` - array of TocEntry objects (nested tree)
- `post.data.metadata.tocgen.generatedAt` - ISO 8601 timestamp

TocEntry shape:
- `id` - string, anchor slug (e.g. "getting-started")
- `text` - string, heading text
- `level` - 2 | 3 | 4
- `children` - TocEntry[] (nested headings)

Companion component: TableOfContents.astro
import: `import TableOfContents from "@plugdash/tocgen/TableOfContents.astro"`
usage: `<TableOfContents post={post} />` or `<TableOfContents post={post} sticky />`
props: post (required), maxDepth (2|3|4), sticky (boolean), class (string)
