# @plugdash/tocgen

Long posts need navigation, and EmDash's `PortableText` renders headings
without ids, so a TOC has nothing to link to. `@plugdash/tocgen` builds the
table of contents from the post body at render time and gives the headings
matching ids. Ships `TableOfContents.astro` and `HeadingAnchors.astro`. No
hooks, no stored data, no registration. The EmDash equivalent of
[Table of Contents Plus](https://wordpress.org/plugins/table-of-contents-plus/).

## Install

```bash
pnpm add @plugdash/tocgen
```

No entry in `astro.config.mjs` is needed. If you registered `tocgenPlugin()`
in an older version it still loads, does nothing, and can be removed:

```js
// astro.config.mjs - optional, deprecated
import emdash from "emdash/astro";
import { tocgenPlugin } from "@plugdash/tocgen";
```

## Use

```astro
---
import { PortableText } from "emdash/ui";
import TableOfContents from "@plugdash/tocgen/TableOfContents.astro";
import HeadingAnchors from "@plugdash/tocgen/HeadingAnchors.astro";
---

<TableOfContents post={post} />
<article>
  <PortableText value={post.data.content} />
  <HeadingAnchors />
</article>
```

`HeadingAnchors` must come after the post body. It runs a tiny inline script
(under 1 KB, no dependencies) that sets an `id` on every `h2`, `h3` and `h4`
that has none, using the same slugs and the same `-2`, `-3` duplicate suffixes
as the TOC. Pass `selector` if your body is not inside an `<article>`.

Slugs keep letters, vowel signs and digits from any script, so Hindi headings get
real ids (`हिंदी शीर्षक` becomes `हिंदी-शीर्षक`). Latin accents are stripped (`Émojis` becomes `emojis`). A heading with no letters or
digits becomes `section`.

### Props: TableOfContents

| Prop        | Type      | Default | Description                                                                              |
| ----------- | --------- | ------- | ---------------------------------------------------------------------------------------- |
| post        | `object`  | -       | The post (required)                                                                      |
| maxDepth    | `2\|3\|4` | `3`     | Deepest heading level to include                                                         |
| minHeadings | `number`  | `3`     | Headings needed before a TOC shows                                                       |
| field       | `string`  | -       | Portable Text field. Default: `content`, then `body`, then the first Portable Text array |
| sticky      | `boolean` | `false` | Stick to the top while scrolling                                                         |
| class       | `string`  | `""`    | Additional CSS class                                                                     |

### Props: HeadingAnchors

| Prop     | Type     | Default     | Description                      |
| -------- | -------- | ----------- | -------------------------------- |
| selector | `string` | `"article"` | CSS selector of the body element |

### CSS custom properties

| Property                     | Default              | Description                 |
| ---------------------------- | -------------------- | --------------------------- |
| `--plugdash-toc-size`        | `0.875rem`           | Font size                   |
| `--plugdash-toc-line-height` | `1.6`                | Line height                 |
| `--plugdash-toc-indent`      | `1rem`               | Nested list padding         |
| `--plugdash-toc-color`       | `inherit`            | Link color                  |
| `--plugdash-toc-hover`       | `#6366f1`            | Link hover color            |
| `--plugdash-toc-top`         | `2rem`               | Sticky offset from top      |
| `--plugdash-toc-max-height`  | `calc(100vh - 4rem)` | Sticky container max-height |

## Blog template

The official blog template already builds an "On this page" TOC with a client
script, and sets its own `heading-0`, `heading-1` ids. To use tocgen instead,
in `src/pages/posts/[slug].astro`:

1. Replace the `<nav class="toc">` block (the one containing `id="toc-content"`) with `<TableOfContents post={post} />`.
2. Put `<HeadingAnchors />` right after `<PortableText value={post.data.content} />`.
3. Delete the `<script>` that fills `toc-content`.

Keep the template's TOC and add tocgen and you will show two TOCs.

## Utilities

```ts
import { getToc, toAnchor } from "@plugdash/tocgen/utils";

getToc(post, { maxDepth: 3, minHeadings: 3 }); // nested entries, [] below minHeadings
```

`extractHeadings`, `deduplicateAnchors`, `nestHeadings` and `getBodyBlocks` are
exported from the same path.

## Upgrading from 0.2

- The `afterSave` hook, the `metadata.tocgen` write, the admin settings page and the `@plugdash/tocgen/sandbox` export are gone. Delete `tocgenPlugin({...})` options: they are ignored. Pass `minHeadings` and `maxDepth` to the component instead.
- Existing `metadata.tocgen.entries` are used only when a post has no Portable Text body.
- `@portabletext/types` is no longer a peer dependency.

## What it does not do

- No hooks, stored data or `metadata` writes
- Does not render the current-section highlight (add scroll-spy in your theme)
- Does not include `h1`
- Does not number headings or render a flat list
- Does not set ids on headings outside the `selector` element
