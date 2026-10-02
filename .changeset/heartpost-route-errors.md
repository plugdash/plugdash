---
"@plugdash/heartpost": patch
---

Bad or unknown post ids now return 400/404 (and rate limits 429) instead of a generic 500, by tagging the package `astro-component` so Astro bundles it with the site's own emdash
