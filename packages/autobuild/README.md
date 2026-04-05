# @plugdash/autobuild

Publish in admin, live in 60 seconds. Triggers a Cloudflare Pages, Netlify,
or Vercel build hook every time you publish content in EmDash. One config
line, one env var, done. Only on EmDash - this is the plugin that makes a
headless CMS feel live.

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

Store the hook URL as an environment variable. Never commit it.

## Getting a deploy hook URL

- **Cloudflare Pages:** Project -> Settings -> Builds & deployments -> Deploy hooks. Creates a URL like `https://api.cloudflare.com/client/v4/pages/webhooks/deploy_hooks/...`
- **Netlify:** Site settings -> Build & deploy -> Build hooks. Creates a URL like `https://api.netlify.com/build_hooks/...`
- **Vercel:** Project Settings -> Git -> Deploy Hooks. Creates a URL like `https://api.vercel.com/v1/integrations/deploy/...`

## Configuration

### Admin dashboard

After installing, open the EmDash admin and go to Plugins - Autobuild -
Settings. Hook URL, method, debounce window, and collections are
available there. The current hook URL is shown masked (hostname + first
8 chars of path); leave the field blank on save to keep the existing
value.

### Config options

| Option         | Type                       | Default         | Description                                               |
| -------------- | -------------------------- | --------------- | --------------------------------------------------------- |
| `hookUrl`      | `string`                   | required        | Deploy webhook URL. Must be https. Must not be localhost or a private IP |
| `method`       | `"POST" \| "GET"`          | `"POST"`        | HTTP method. Vercel uses POST, Cloudflare Pages uses POST, Netlify uses POST or GET |
| `collections`  | `string[]`                 | all collections | Only trigger rebuilds for these collections               |
| `statuses`     | `ContentStatus[]`          | `["published"]` | Statuses that trigger a rebuild                           |
| `debounceMs`   | `number`                   | `5000`          | Coalesce rapid publishes into one deploy                  |
| `timeout`      | `number`                   | `5000`          | Request timeout in milliseconds                           |
| `body`         | `Record<string, unknown>`  | none            | Optional JSON body. Most deploy hooks accept empty POST   |
| `headers`      | `Record<string, string>`   | none            | Optional additional request headers                       |
| `allowedHosts` | `string[]`                 | auto            | Override the auto-parsed allowedHosts (for CDN/LB setups) |

## How it works

1. Plugin registers on `content:afterSave` and `content:afterDelete` with `read:content` and `network:fetch` capabilities.
2. When a published post is saved (or any post is deleted), the plugin schedules a debounced webhook fire.
3. After the debounce window elapses, it POSTs to the hook URL via `ctx.http.fetch()`.
4. The original save/delete event is never blocked - webhook failures log but do not fail the admin operation.

## Security

autobuild validates the hook URL before every fetch:

- `https://` only. No http, no file, no other schemes.
- Blocks `localhost`, `127.x.x.x`, `0.0.0.0`, `::1`.
- Blocks RFC1918 private ranges: `10.x.x.x`, `172.16-31.x.x`, `192.168.x.x`.
- Blocks `169.254.x.x` (link-local, including the AWS instance metadata endpoint).

A misconfigured hookUrl fails closed: no fetch is made, an error is logged.

## What it does not do

- Does not retry failed deploys. The next publish retries.
- Does not verify that the deploy succeeded - check your Pages/Netlify/Vercel dashboard for deploy status.
- Does not sign or authenticate requests. Deploy hooks are already secret URLs.
- Does not persist debounce state across process restarts. A pending webhook is dropped on restart.
- Does not ship a UI component. This plugin is pure infrastructure.
