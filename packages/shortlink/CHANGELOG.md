# @plugdash/shortlink

## 0.3.0

### Minor Changes

- 0d22ce6: Rebuilt on EmDash native redirects. On publish, each entry gets one 301 redirect `/s/<code>` (group `shortlink`), where the code is the last 8 characters of the entry id. The plugin is now native and needs `redirects:write` and `schema:read`.

  Breaking: `RedirectPage.astro`, the `./sandbox` export, the resolve route, the admin table, `autoCreate` and the shortlink metadata are removed. To upgrade, register `shortlinkPlugin()` under `plugins` (not `sandboxed`) in astro.config.mjs, drop `autoCreate` from its options, and delete `src/pages/s/[code].astro`. Generated 0.2.x codes keep working, because the plugin recreates them as redirects on the entry's next publish. Codes you made by hand in 0.2.x are not migrated: add them as redirects in the admin Redirects screen. Deleting a shortlink redirect does not stick, because the next publish creates it again; disable it in the Redirects screen instead. `CopyLink` now builds the URL from `post.data.id` and takes a `prefix` prop.

## 0.2.4

### Patch Changes

- 121bffa: Plugin version now comes from package.json, so the version reported to EmDash always matches the published package

## 0.2.3

### Patch Changes

- 23613eb: Fix definePlugin() removal for current emdash, rename capabilities to canonical names, allow hyphens in custom shortlink codes.

## 0.2.2

### Patch Changes

- 6ae7d86: Fix shortlink creation by syncing descriptor version with package version.
  Replace copy icon with link icon in CopyLink.astro. Add "inline" variant
  to CopyLink Props and CSS.

## 0.2.0

### Minor Changes

- 95f903d: Add Block Kit admin configuration pages. Each plugin now ships a settings form at Plugins - [Name] - Settings in the EmDash admin, writing to the same KV config keys the hooks already read. Autobuild masks the stored hook URL and preserves it when the input is left blank. Shortlink's admin page dispatches on block_action in addition to button_click.

## 0.1.1

### Patch Changes

- eefc449: Initial release. Auto-generates short URLs for EmDash posts on publish. Ships CopyLink.astro component and public resolve route at /s/[code].
