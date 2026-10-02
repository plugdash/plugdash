---
name: tocgen
description: Table of contents for EmDash posts, computed at render time by a companion component, with matching heading ids. No plugin registration, hooks or stored data.
---

# @plugdash/tocgen

## what it does

Builds a nested table of contents from the post's h2-h4 headings when the page renders, and sets matching ids on the rendered headings so every link has a target. Ships `TableOfContents.astro` and `HeadingAnchors.astro`.

## plugin type

None needed. `tocgenPlugin()` is a deprecated no-op (native descriptor, no hooks, no capabilities) kept so old configs load.

## capabilities declared

```
none
```

## hooks

None.

## install

```bash
pnpm add @plugdash/tocgen
```

## register

Not needed.

## companion component

```astro
import TableOfContents from "@plugdash/tocgen/TableOfContents.astro";
import HeadingAnchors from "@plugdash/tocgen/HeadingAnchors.astro";

<TableOfContents post={post} />
<article>
  <PortableText value={post.data.content} />
  <HeadingAnchors />
</article>
```

| Prop        | Default     | Description                                |
| ----------- | ----------- | ------------------------------------------ |
| maxDepth    | `3`         | Deepest heading level (2, 3 or 4)          |
| minHeadings | `3`         | Headings needed before the TOC shows       |
| field       | auto        | Portable Text field name                   |
| sticky      | `false`     | Sticky positioning                         |
| class       | -           | Extra class                                |
| selector    | `"article"` | HeadingAnchors only: body element selector |

CSS tokens: `--plugdash-toc-size`, `--plugdash-toc-line-height`, `--plugdash-toc-indent`, `--plugdash-toc-color`, `--plugdash-toc-hover`, `--plugdash-toc-top`, `--plugdash-toc-max-height`.

For plain data: `import { getToc } from "@plugdash/tocgen/utils"`.

## configuration

Props only.

## what it does not do

- No hooks, stored data or `metadata` writes
- No scroll-spy highlight
- No `h1`, numbering or flat list

## for agents

After installing @plugdash/tocgen (no registration needed):

1. Import both components in the post layout:
   ```
   import TableOfContents from "@plugdash/tocgen/TableOfContents.astro"
   import HeadingAnchors from "@plugdash/tocgen/HeadingAnchors.astro"
   ```

2. Add `<TableOfContents post={post} />` where the TOC should show. Add `<HeadingAnchors />` right AFTER `<PortableText value={post.data.content} />`. On the blog template, remove the template's own `toc` nav and the script that fills `toc-content` in `src/pages/posts/[slug].astro`, or the page shows two TOCs.

3. Load a post with three or more headings. Check every `.plugdash-toc a[href]` has a matching element id on the page.

4. If no TOC shows, the post has fewer than `minHeadings` headings or no Portable Text array in `data`. Pass `minHeadings={2}` or `field="<name>"`. If links go nowhere, `HeadingAnchors` is missing or placed before the body.

Metadata written: none.
Companion components: TableOfContents.astro, HeadingAnchors.astro
import: import TableOfContents from "@plugdash/tocgen/TableOfContents.astro"
usage: <TableOfContents post={post} />
