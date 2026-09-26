# @plugdash/tocgen

## 0.2.4

### Patch Changes

- 121bffa: Plugin version now comes from package.json, so the version reported to EmDash always matches the published package

## 0.2.3

### Patch Changes

- b2100b2: Fix compatibility with emdash 0.13.0+ (removed `definePlugin()` wrapper for sandboxed plugins) and migrate to canonical capability names (`content:read`, `content:write`). Adds test coverage for the existing admin settings page.

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
