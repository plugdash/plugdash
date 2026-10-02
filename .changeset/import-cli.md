---
"@plugdash/import": minor
---

New package: the `plugdash-import` CLI imports Ghost JSON and Substack zip exports into an EmDash site over the REST API. It uploads media, creates tags, carries SEO fields over and skips slugs that already exist, so re-runs are safe. Paid posts import as drafts even with `--publish`; pass `--paid-posts-as publish` to publish them too.
