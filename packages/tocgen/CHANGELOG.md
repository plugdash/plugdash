# @plugdash/tocgen

## 0.2.2

### Patch Changes

- 6ae7d86: Export extractHeadings, toAnchor, deduplicateAnchors, and nestHeadings
  from new ./utils subpath so consumers can reuse TOC generation without
  reimplementing it. Sync descriptor version with package version.

## 0.2.0

### Minor Changes

- 95f903d: Add Block Kit admin configuration pages. Each plugin now ships a settings form at Plugins - [Name] - Settings in the EmDash admin, writing to the same KV config keys the hooks already read. Autobuild masks the stored hook URL and preserves it when the input is left blank. Shortlink's admin page dispatches on block_action in addition to button_click.

## 0.1.1

### Patch Changes

- eefc449: Initial release. Auto-generated table of contents for EmDash posts from Portable Text headings. Ships TableOfContents.astro component with optional sticky sidebar positioning.
