# @plugdash/heartpost

## 0.2.2

### Patch Changes

- 121bffa: Plugin version now comes from package.json, so the version reported to EmDash always matches the published package

## 0.2.1

### Patch Changes

- bd9a33e: Remove definePlugin() from the sandboxed entrypoint (required by current emdash), rename the remaining capability to the canonical content:read (content:write was unused and is dropped), and clean up stale peerDependency/version metadata. The unheart route, localStorage fallback, post.id/post.data.id fallback, and admin settings page were all already implemented and tested - no changes needed there.

## 0.2.0

### Minor Changes

- 95f903d: Add Block Kit admin configuration pages. Each plugin now ships a settings form at Plugins - [Name] - Settings in the EmDash admin, writing to the same KV config keys the hooks already read. Autobuild masks the stored hook URL and preserves it when the input is left blank. Shortlink's admin page dispatches on block_action in addition to button_click.

## 0.1.1

### Patch Changes

- eefc449: Initial release. Heart/like button for EmDash posts with per-post counters and duplicate prevention. Ships HeartButton.astro component.
