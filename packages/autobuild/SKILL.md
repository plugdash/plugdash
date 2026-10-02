---
name: autobuild
description: Fires a Cloudflare Pages, Netlify, or Vercel build hook when content is published or unpublished. For static or prerendered sites only.
---

# skill: autobuild

## what it does

Calls a deploy hook (Cloudflare Pages, Netlify, Vercel) after a publish, an unpublish, or the delete of a published entry. Use it only when a static or prerendered site reads EmDash content at build time. A server-rendered EmDash site (`output: "server"`) shows new content at once and needs no rebuild.

## plugin type

Native

## capabilities declared

```
content:read
network:request
```

`allowedHosts`: `api.cloudflare.com`, `api.netlify.com`, `api.vercel.com`, the host of `hookUrl`, plus the `allowedHosts` option.

## hooks

- `content:afterPublish` - schedules a debounced deploy
- `content:afterUnpublish` - schedules a debounced deploy
- `content:beforeDelete` - notes in KV whether the entry was published
- `content:afterDelete` - schedules a deploy only if it was published

No `content:afterSave`: autosaves never trigger a deploy.

## install

```bash
pnpm add @plugdash/autobuild
```

## register

```js
// astro.config.mjs
import emdash from "emdash/astro";
import { autobuildPlugin } from "@plugdash/autobuild";

emdash({
	plugins: [autobuildPlugin({ hookUrl: process.env.DEPLOY_HOOK_URL, collections: ["posts"] })],
});
```

## companion component

None. Pure infrastructure.

## configuration

| option         | type              | default  | description                                                      |
| -------------- | ----------------- | -------- | ---------------------------------------------------------------- |
| `hookUrl`      | `string`          | none     | Deploy hook URL, https only. Admin secret setting `hookUrl` wins |
| `method`       | `"POST" \| "GET"` | `"POST"` | HTTP method                                                      |
| `collections`  | `string[]`        | all      | Collections that trigger a deploy                                |
| `debounceMs`   | `number`          | `5000`   | Triggers inside this window make one deploy                      |
| `timeout`      | `number`          | `5000`   | Request timeout in ms                                            |
| `body`         | `object`          | none     | Optional JSON body                                               |
| `headers`      | `object`          | none     | Optional extra headers                                           |
| `allowedHosts` | `string[]`        | defaults | Extra allowed hosts                                              |

## what it does not do

- Does not retry failed deploys
- Does not verify the deploy succeeded
- Does not sign requests
- Does not allow `http://`, localhost, or private-IP hook URLs

## for agents

After installing @plugdash/autobuild and registering it in astro.config.mjs:

1. Confirm the site is static or prerendered. If it is `output: "server"`, do not install autobuild.
2. Get a deploy hook URL from the host and put it in an env var, for example `DEPLOY_HOOK_URL`.
3. Pass it: `autobuildPlugin({ hookUrl: process.env.DEPLOY_HOOK_URL })`. Or set the secret "Deploy hook URL" in the plugin settings (needs `EMDASH_ENCRYPTION_KEY`).
4. Publish a test post and wait `debounceMs` plus a few seconds. The server log shows `webhook fired` (or `webhook non-2xx` / `webhook failed`, which still means a request was attempted).
5. If nothing fires: look for `no hook URL configured, deploys are off`, `hook host not allowed` (add the host to the `allowedHosts` option) or `invalid hook url` in the log. Autosaves and draft edits never fire.

Metadata written: none
Companion component: none
KV keys: `gen` (debounce token), `live:<id>` (delete marker)
