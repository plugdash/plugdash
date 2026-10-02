---
"@plugdash/fromghost": minor
---

Register the source in createPlugin so options reach production, resolve `__GHOST_URL__` in post HTML, list inline images as attachments, import paid posts as drafts (paidPostsAs), return warnings on the analysis, and load the HTML converter lazily

Breaking: posts with Ghost visibility `members`, `paid` or `tiers` now import as drafts by default. To keep publishing them, pass `paidPostsAs: "publish"` in astro.config.mjs.
