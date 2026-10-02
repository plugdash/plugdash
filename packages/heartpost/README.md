# @plugdash/heartpost

Readers want to acknowledge a post without writing a comment, and a like
button that writes a database row per visitor grows without bound.
Heartpost keeps one count per post and remembers who hearted in the reader's
own browser. Ships HeartButton.astro - a drop-in heart button with a
bottom-to-top fill animation. No WordPress equivalent - only on EmDash.

## Install

```bash
pnpm add @plugdash/heartpost
```

## Register

```js
// astro.config.mjs
import { defineConfig } from "astro/config";
import emdash from "emdash/astro";
import { heartpostPlugin } from "@plugdash/heartpost";

export default defineConfig({
	integrations: [
		emdash({
			plugins: [heartpostPlugin()],
		}),
	],
});
```

## Configuration

| Option             | Type             | Default     | Description                                                          |
| ------------------ | ---------------- | ----------- | -------------------------------------------------------------------- |
| collections        | `string[]`       | `["posts"]` | Collections whose entries can be hearted                             |
| rateLimitPerMinute | `number`         | `10`        | Hearts per client IP per minute. `0` turns the limit off             |
| trustProxyHeader   | `string \| null` | `null`      | Header to read the client IP from when you sit behind your own proxy |
| label              | `string`         | `"hearts"`  | Label for the heart count                                            |

`collections` used to default to every collection. It now defaults to
`["posts"]`. Pass the collections you want if you heart anything else.

## Companion component

```astro
---
import HeartButton from "@plugdash/heartpost/HeartButton.astro";
---

<HeartButton post={post} />
```

| Prop    | Type                            | Default    | Description                                                                 |
| ------- | ------------------------------- | ---------- | --------------------------------------------------------------------------- |
| post    | `Record<string, unknown>`       | (required) | Content item. Hearts are keyed on `post.data.id`, falling back to `post.id` |
| variant | `"circle" \| "pill" \| "ghost"` | `"circle"` | Visual style                                                                |
| size    | `"sm" \| "md" \| "lg"`          | `"md"`     | Component size                                                              |
| theme   | `"auto" \| "dark" \| "light"`   | `"auto"`   | Color scheme                                                                |
| class   | `string`                        | `""`       | Additional CSS class                                                        |

CSS custom properties: `--plugdash-heart-color`, `--plugdash-heart-fill-duration`,
`--plugdash-engage-size`, `--plugdash-engage-radius`, `--plugdash-engage-border`,
`--plugdash-engage-bg`, `--plugdash-engage-bg-hover`.

## How it works

- One KV row per post: `count:<entry id>`. 1,000 hearts on a post is still one row.
- Whether a visitor hearted is stored in their browser (`localStorage`, key
  `plugdash-heart-<entry id>`). Clearing site data or switching browsers lets the
  same person heart again. The count is a soft count, not a vote.
- The button loads its count only when it is within 200px of the viewport. A page
  that is never scrolled that far makes no request. Several buttons for one post
  share a single request and update together.
- Hearting needs a published entry in one of the `collections`. Anything else is rejected.
- Rate limiting counts hearts per client IP per minute in a small storage collection.
  Old buckets are removed as new ones are written.

## Rate limiting and the client IP

The IP comes from EmDash's `requestMeta.ip`, which only trusts forwarding headers
on Cloudflare or when you declare them. A spoofed `X-Forwarded-For` is ignored.
When there is no trusted IP (for example a plain local `node` server) the plugin
logs one warning and skips the limit. If you run behind your own proxy, set
`trustProxyHeader` to the header it sets.

The built-in limit is a speed bump. For a public site, add a platform rate limit
on `POST /_emdash/api/plugins/heartpost/heart` and `heart-remove` too, for example
a Cloudflare Rate Limiting rule on that path.

## Upgrading from 0.2.x

- Existing counts carry over. The first heart on a post reads the old
  `heartpost:<id>:count` key and continues from the larger number.
- Old per-visitor rows are not deleted automatically. Open the EmDash admin,
  go to Plugins - Heart Post, and use "Remove old visitor rows".
- The sandboxed `./sandbox` export is gone. Heartpost is a native plugin now.
- The `content:afterSave` hook is gone. Counts are created on the first heart.

## What it does not do

- Does not stop a determined visitor from hearting more than once
- Does not store IPs, fingerprints, or any visitor data in the database
- Does not heart drafts, archived, or scheduled entries
- Does not provide an admin page for viewing counts
