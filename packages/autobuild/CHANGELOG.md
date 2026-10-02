# @plugdash/autobuild

## 0.3.0

### Minor Changes

- 90c9a6b: Rewrite as a native plugin: fire on publish, unpublish and delete of a published entry only (not on autosave), read options from createPlugin so the hook URL works in production, debounce through KV, and take the hook URL from an admin secret setting.

  Breaking: the `statuses` option is removed (deploys fire on publish, unpublish and delete of a published entry only), the `./sandbox` export is gone, and emdash >=1.0.0 is required. To upgrade, move `autobuildPlugin()` from `sandboxed` to `plugins` in astro.config.mjs if it was there, drop `statuses` from its options, and read the hook URL with `process.env` (or set it in the admin, which needs `EMDASH_ENCRYPTION_KEY`).

## 0.2.2

### Patch Changes

- 121bffa: Plugin version now comes from package.json, so the version reported to EmDash always matches the published package

## 0.2.1

### Patch Changes

- 5790c2b: Remove the definePlugin() wrapper from sandbox-entry.ts (removed for Standard plugins in emdash 0.13.0+) and rename deprecated capability strings to their canonical names (network:fetch -> network:request, read:content -> content:read).

## 0.2.0

### Minor Changes

- 95f903d: Add Block Kit admin configuration pages. Each plugin now ships a settings form at Plugins - [Name] - Settings in the EmDash admin, writing to the same KV config keys the hooks already read. Autobuild masks the stored hook URL and preserves it when the input is left blank. Shortlink's admin page dispatches on block_action in addition to button_click.

## 0.1.1

### Patch Changes

- 61fd52a: Initial release. Fires a Cloudflare Pages, Netlify, or Vercel build hook on every EmDash publish. Debounces rapid publishes into one deploy, rejects SSRF-prone URLs, never blocks the publish event on webhook latency.
