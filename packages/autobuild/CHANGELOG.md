# @plugdash/autobuild

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
