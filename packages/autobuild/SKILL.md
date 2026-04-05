---
name: autobuild
description: Fires a Cloudflare Pages, Netlify, or Vercel build hook on every publish from EmDash. Triggers a rebuild of the live site when content is published or deleted.
---

# @plugdash/autobuild

Triggers a deploy webhook on every EmDash publish. Posts to a Cloudflare
Pages, Netlify, or Vercel build hook URL. Fire-and-forget: debounces rapid
publishes into one deploy, logs the result, never blocks the publish event.

## Plugin type

Standard

## Capabilities

```
network:fetch
read:content
```

`read:content` is required to register `content:afterSave` and
`content:afterDelete` hooks, even though the plugin does not call
`ctx.content.get()`. `network:fetch` is required to call `ctx.http.fetch()`.
The `allowedHosts` array is auto-populated from `hookUrl`'s hostname.

## Hooks

- `plugin:install` - seeds KV config from the `autobuildPlugin({...})` options passed at build time
- `content:afterSave` - schedules a debounced webhook fire when a published post is saved
- `content:afterDelete` - schedules a debounced webhook fire on any delete

## Install

```bash
pnpm add @plugdash/autobuild
```

## Register

```js
// astro.config.mjs
import { defineConfig } from "astro/config";
import emdash from "emdash";
import { autobuildPlugin } from "@plugdash/autobuild";

export default defineConfig({
  integrations: [
    emdash({
      plugins: [
        autobuildPlugin({
          hookUrl: import.meta.env.CF_PAGES_DEPLOY_HOOK,
          collections: ["posts"],
          debounceMs: 5000,
        }),
      ],
    }),
  ],
});
```

## Config options

| Option         | Type                      | Default         |
| -------------- | ------------------------- | --------------- |
| `hookUrl`      | `string`                  | required        |
| `method`       | `"POST" \| "GET"`         | `"POST"`        |
| `collections`  | `string[]`                | all             |
| `statuses`     | `ContentStatus[]`         | `["published"]` |
| `debounceMs`   | `number`                  | `5000`          |
| `timeout`      | `number`                  | `5000`          |
| `body`         | `Record<string, unknown>` | none            |
| `headers`      | `Record<string, string>`  | none            |
| `allowedHosts` | `string[]`                | auto            |

## No companion component

autobuild has no UI. It is pure infrastructure. Nothing to import, nothing
to render.

## What it does not do

- Does not retry failed deploys. The next publish retries.
- Does not verify that the deploy succeeded.
- Does not sign requests.
- Does not persist debounce state across process restarts.
- Does not allow `http://`, `localhost`, or private-IP hook URLs (SSRF protection).

## For agents

After installing @plugdash/autobuild and registering it in astro.config.mjs:

0. To configure without code: navigate to EmDash admin - Plugins -
   Autobuild - Settings. Hook URL, method, debounce window, and
   collections are available in the dashboard. The current hook URL is
   masked; leave the field blank on save to keep it unchanged.

1. Get a deploy hook URL from the hosting provider:
   - **Cloudflare Pages:** Project -> Settings -> Builds & deployments -> Deploy hooks
   - **Netlify:** Site settings -> Build & deploy -> Build hooks
   - **Vercel:** Project Settings -> Git -> Deploy Hooks

2. Store the URL in an environment variable. Example `.env`:
   ```
   CF_PAGES_DEPLOY_HOOK=https://api.cloudflare.com/client/v4/pages/webhooks/deploy_hooks/...
   ```

3. Pass it to autobuildPlugin in astro.config.mjs:
   ```js
   autobuildPlugin({ hookUrl: import.meta.env.CF_PAGES_DEPLOY_HOOK })
   ```

4. Publish a test post in the admin. Wait `debounceMs` + a few seconds.
   Check the hosting provider's dashboard for a new deploy triggered within
   that window.

5. If no deploy fires:
   - Confirm `hookUrl` is set (check admin logs for `autobuild: hookUrl not configured`).
   - Confirm the URL is `https://` and not a private IP (SSRF protection rejects these).
   - Check admin logs for `autobuild: webhook non-2xx` or `autobuild: webhook failed`.

The plugin writes no metadata to content. Its only observable effect is
the POST to the configured hook URL and log entries under the `autobuild:`
prefix.

Capabilities declared: `network:fetch`, `read:content`
Hooks: `plugin:install`, `content:afterSave`, `content:afterDelete`
KV keys written: `autobuild:config:*`, `autobuild:bootstrapHash`
