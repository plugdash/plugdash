# @plugdash/import

## 0.1.0

### Minor Changes

- d907595: New package: the `plugdash-import` CLI imports Ghost JSON and Substack zip exports into an EmDash site over the REST API. It uploads media, creates tags, carries SEO fields over and skips slugs that already exist, so re-runs are safe. Paid posts import as drafts even with `--publish`; pass `--paid-posts-as publish` to publish them too.

### Patch Changes

- Updated dependencies [2062e8b]
- Updated dependencies [e047f84]
- Updated dependencies [686145c]
  - @plugdash/fromghost@0.2.0
  - @plugdash/fromsubstack@0.2.0
