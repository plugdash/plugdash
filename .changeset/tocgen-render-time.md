---
"@plugdash/tocgen": minor
---

Compute the table of contents in TableOfContents.astro at render time. No hooks, no metadata writes, no plugin registration needed. Adds HeadingAnchors.astro so TOC links have targets, Unicode-safe heading ids (Hindi and other scripts work), minHeadings and field props, and drops the sandbox entry, admin page and the @portabletext/types peer dependency.

Breaking: the `./sandbox` export, the hooks and the TOC metadata they wrote are removed. To upgrade, remove `tocgenPlugin()` from `plugins` or `sandboxed` in astro.config.mjs, and add `<HeadingAnchors />` after the post body (or give headings your own ids) so the TOC links have targets.
