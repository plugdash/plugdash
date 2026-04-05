# @plugdash/autobuild

## 0.1.1

### Patch Changes

- 61fd52a: Initial release. Fires a Cloudflare Pages, Netlify, or Vercel build hook on every EmDash publish. Debounces rapid publishes into one deploy, rejects SSRF-prone URLs, never blocks the publish event on webhook latency.
