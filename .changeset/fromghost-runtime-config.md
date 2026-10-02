---
"@plugdash/fromghost": minor
---

Register the source in createPlugin so options reach production, resolve `__GHOST_URL__` in post HTML, list inline images as attachments, import paid posts as drafts (paidPostsAs), return warnings on the analysis, load the HTML converter lazily, and read SEO title and description from Ghost 4+ posts_meta

Breaking: posts with Ghost visibility `members`, `paid` or `tiers` now import as drafts by default. To keep publishing them, pass `paidPostsAs: "publish"` in astro.config.mjs.
