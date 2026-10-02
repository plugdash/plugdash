# @plugdash/autobuild

Use autobuild only when a **static** or prerendered site reads EmDash content at build time. A server-rendered EmDash site (`output: "server"`, the default in all templates) shows new content at once and does not need a rebuild.

When one of those static sites needs a rebuild, autobuild calls a Cloudflare Pages, Netlify, or Vercel deploy hook after you publish or unpublish. Only on EmDash - the hook fires from the CMS lifecycle, not from a git push.

## Install

```bash
pnpm add @plugdash/autobuild
```

## Register

```js
// astro.config.mjs
import { defineConfig } from "astro/config";
import emdash from "emdash/astro";
import { autobuildPlugin } from "@plugdash/autobuild";

export default defineConfig({
	integrations: [
		emdash({
			plugins: [
				autobuildPlugin({
					hookUrl: process.env.DEPLOY_HOOK_URL,
					collections: ["posts"],
					debounceMs: 5000,
				}),
			],
		}),
	],
});
```

Keep the hook URL in an environment variable. Never commit it. Options are passed to the plugin by EmDash at runtime, so they work in `astro dev` and in a production build.

Or set the URL in the admin: Plugins - Autobuild - settings, field "Deploy hook URL" (a secret). The admin value wins over the `hookUrl` option. Secret settings need `EMDASH_ENCRYPTION_KEY` in the server environment (`pnpm exec emdash secrets generate`; a Worker secret on Cloudflare). The admin page shows whether the URL is accepted.

## Getting a deploy hook URL

- **Cloudflare Pages:** Project -> Settings -> Builds & deployments -> Deploy hooks. Creates a URL like `https://api.cloudflare.com/client/v4/pages/webhooks/deploy_hooks/...`
- **Netlify:** Site settings -> Build & deploy -> Build hooks. Creates a URL like `https://api.netlify.com/build_hooks/...`
- **Vercel:** Project Settings -> Git -> Deploy Hooks. Creates a URL like `https://api.vercel.com/v1/integrations/deploy/...`

## Options

| Option         | Type                      | Default         | Description                                                 |
| -------------- | ------------------------- | --------------- | ----------------------------------------------------------- |
| `hookUrl`      | `string`                  | none            | Deploy webhook URL. https only, no localhost or private IPs |
| `method`       | `"POST" \| "GET"`         | `"POST"`        | HTTP method                                                 |
| `collections`  | `string[]`                | all collections | Only these collections trigger a deploy                     |
| `debounceMs`   | `number`                  | `5000`          | Triggers inside this window make one deploy                 |
| `timeout`      | `number`                  | `5000`          | Request timeout in ms                                       |
| `body`         | `Record<string, unknown>` | none            | Optional JSON body                                          |
| `headers`      | `Record<string, string>`  | none            | Optional extra headers                                      |
| `allowedHosts` | `string[]`                | see below       | Extra hosts the plugin may call, added to the defaults      |

`allowedHosts` always includes `api.cloudflare.com`, `api.netlify.com`, `api.vercel.com` and the host of the `hookUrl` option. A hook URL entered in the admin on any other host is refused until you add that host here.

## How it works

1. `content:afterPublish` and `content:afterUnpublish` schedule a deploy. Autosaves do not: editing a draft or a live post changes nothing a reader can see.
2. Deleting an entry schedules a deploy only if it was published. `content:beforeDelete` notes that in KV, because `afterDelete` only carries the id.
3. Each trigger writes a token to plugin KV and waits `debounceMs`. Only the trigger whose token is still the latest calls the hook, so a burst makes one request, even across Workers isolates.
4. The request goes out through `ctx.http.fetch()`. A failure is logged and never fails the publish.
5. With no hook URL, the plugin logs one warning per process: `no hook URL configured, deploys are off`.

## Security

The hook URL is checked before every request: `https://` only, no `localhost`, `127.x`, `10.x`, `172.16-31.x`, `192.168.x`, `169.254.x`, `::1`, `0.0.0.0`, and the host must be in `allowedHosts`. A bad URL fails closed with a logged error.

## What it does not do

- Does not retry failed deploys. The next publish retries.
- Does not check that the deploy succeeded - use your host's dashboard.
- Does not sign requests. Deploy hooks are already secret URLs.
- Does not ship a UI component. This plugin is pure infrastructure.
