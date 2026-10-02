---
"@plugdash/socialcard": minor
---

Render cards as PNG on publish and set them as the entry's SEO image, skip unchanged posts, and move to the native plugin format

Breaking: `metadata.ogImage` is no longer written; the card goes to the entry's `seo.image`. The `fonts` option (CSS font stacks) is replaced by `fontFiles` (TTF/OTF URLs or paths), and emdash >=1.0.0 is required. To upgrade, move `socialcardPlugin()` from `sandboxed` to `plugins` in astro.config.mjs if it was there, replace `fonts` with `fontFiles`, and remove any template `og:image` tag built from `post.data.metadata.ogImage`; `getSeoMeta()` and `EmDashHead` emit it from `seo.image`, or read `post.seo.image` and prefix it with `Astro.url.origin`.
