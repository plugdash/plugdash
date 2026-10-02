# @plugdash/socialcard

## 0.2.0

### Minor Changes

- b166e16: Render cards as PNG on publish and set them as the entry's SEO image, skip unchanged posts, and move to the native plugin format

  Breaking: `metadata.ogImage` is no longer written; the card goes to the entry's `seo.image`. The `fonts` option (CSS font stacks) is replaced by `fontFiles` (TTF/OTF URLs or paths), and emdash >=1.0.0 is required. To upgrade, move `socialcardPlugin()` from `sandboxed` to `plugins` in astro.config.mjs if it was there, replace `fonts` with `fontFiles`, and remove any template `og:image` tag built from `post.data.metadata.ogImage`; `getSeoMeta()` and `EmDashHead` emit it from `seo.image`, or read `post.seo.image` and prefix it with `Astro.url.origin`.

## 0.1.2

### Patch Changes

- 121bffa: Plugin version now comes from package.json, so the version reported to EmDash always matches the published package

## 0.1.1

### Patch Changes

- 78c5b55: Republish with a real build. 0.1.0 of socialcard, fromghost and fromsubstack shipped without dist/, and enrichkit 0.1.0 shipped a stale sandbox bundle that imported a sibling file. fromghost also no longer depends on the unpublished @plugdash/html-to-portable-text (it's bundled now).
