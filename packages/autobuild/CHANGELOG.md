# @plugdash/autobuild

## 0.2.0

### Minor Changes

- 95f903d: Add Block Kit admin configuration pages. Each plugin now ships a settings form at Plugins - [Name] - Settings in the EmDash admin, writing to the same KV config keys the hooks already read. Autobuild masks the stored hook URL and preserves it when the input is left blank. Shortlink's admin page dispatches on block_action in addition to button_click.

## 0.1.1

### Patch Changes

- 61fd52a: Initial release. Fires a Cloudflare Pages, Netlify, or Vercel build hook on every EmDash publish. Debounces rapid publishes into one deploy, rejects SSRF-prone URLs, never blocks the publish event on webhook latency.
