---
"@plugdash/fromsubstack": minor
---

Match the real Substack export format (post_id with slug, no url column), import paid posts as drafts by default (paidPostsAs), drop subscribe and share boilerplate, return warnings from analyze(), and load fflate and linkedom lazily

Breaking: paid posts (`only_paid`, `founding`) now import as drafts by default, even when `status` is `"published"`. To keep publishing them, pass `paidPostsAs: "publish"` in astro.config.mjs.
