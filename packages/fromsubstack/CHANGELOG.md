# @plugdash/fromsubstack

## 0.2.0

### Minor Changes

- e047f84: Match the real Substack export format (post_id with slug, no url column), import paid posts as drafts by default (paidPostsAs), drop subscribe and share boilerplate, return warnings from analyze(), and load fflate and linkedom lazily

  Breaking: paid posts (`only_paid`, `founding`) now import as drafts by default, even when `status` is `"published"`. To keep publishing them, pass `paidPostsAs: "publish"` in astro.config.mjs.

### Patch Changes

- 686145c: Keep images that sit inside a paragraph. The HTML converter used to drop `<p>text <img> text</p>` images; it now splits the paragraph into a text block, an image block and a text block

## 0.1.2

### Patch Changes

- 121bffa: Plugin version now comes from package.json, so the version reported to EmDash always matches the published package

## 0.1.1

### Patch Changes

- 78c5b55: Republish with a real build. 0.1.0 of socialcard, fromghost and fromsubstack shipped without dist/, and enrichkit 0.1.0 shipped a stale sandbox bundle that imported a sibling file. fromghost also no longer depends on the unpublished @plugdash/html-to-portable-text (it's bundled now).
