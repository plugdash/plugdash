# @plugdash/readtime

## 0.2.2

### Patch Changes

- 121bffa: Plugin version now comes from package.json, so the version reported to EmDash always matches the published package

## 0.2.1

### Patch Changes

- b503044: Fix definePlugin() removal crash against current emdash and rename capabilities to canonical content:read/content:write.

## 0.2.0

### Minor Changes

- 95f903d: Add Block Kit admin configuration pages. Each plugin now ships a settings form at Plugins - [Name] - Settings in the EmDash admin, writing to the same KV config keys the hooks already read. Autobuild masks the stored hook URL and preserves it when the input is left blank. Shortlink's admin page dispatches on block_action in addition to button_click.

## 0.1.1

### Patch Changes

- eefc449: Initial release. Calculates word count and reading time for EmDash posts on publish. Ships ReadingTime.astro component with badge, pill, inline, and minimal variants.
