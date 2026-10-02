---
"@plugdash/heartpost": minor
---

Store one count per post instead of one row per visitor, keep hearted state in localStorage, rate limit on the trusted client IP, and fetch the count only when the button scrolls into view

Breaking: heartpost is now a native plugin, the `./sandbox` export and the `content:afterSave` hook are removed, and `collections` now defaults to `["posts"]` instead of every collection. To upgrade, register `heartpostPlugin()` under `plugins` (not `sandboxed`) in astro.config.mjs and pass `collections` if you heart anything other than posts. Existing counts carry over on the first new heart; old per-visitor rows stay until you run "Remove old visitor rows" in the Heart Post admin page.
