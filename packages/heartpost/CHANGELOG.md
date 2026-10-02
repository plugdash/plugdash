# @plugdash/heartpost

## 0.3.0

### Minor Changes

- 2188e23: Store one count per post instead of one row per visitor, keep hearted state in localStorage, rate limit on the trusted client IP, and fetch the count only when the button scrolls into view

  Breaking: heartpost is now a native plugin, the `./sandbox` export and the `content:afterSave` hook are removed, and `collections` now defaults to `["posts"]` instead of every collection. To upgrade, register `heartpostPlugin()` under `plugins` (not `sandboxed`) in astro.config.mjs and pass `collections` if you heart anything other than posts. Existing counts carry over on the first new heart; old per-visitor rows stay until you run "Remove old visitor rows" in the Heart Post admin page.

### Patch Changes

- 6a2207e: Read the count and hearted state from EmDash's wrapped route response, so the heart button shows the real count after a page load
- 2cde086: Bad or unknown post ids now return 400/404 (and rate limits 429) instead of a generic 500, by tagging the package `astro-component` so Astro bundles it with the site's own emdash

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
