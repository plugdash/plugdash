---
name: heartpost
description: Heart button plugin for EmDash with one count per post, hearted state kept in the reader's browser. Ships HeartButton.astro.
---

# skill: heartpost

## what it does

Adds a heart button to EmDash posts. The server keeps one count per post and the
browser remembers whether that reader hearted.

## plugin type

Native

## capabilities declared

```
content:read
```

Storage: `hits` collection (indexed on `bucket`) for rate limiting.

## hooks

None.

## routes

- `heart` (POST, public) - body `{ id, legacyId? }`, adds 1, returns `{ count }`
- `heart-remove` (POST, public) - same body, subtracts 1 (never below 0)
- `heart-status` (GET, public) - `?id=<entry id>`, returns `{ count }`
- `admin` - Plugins - Heart Post page with a "Remove old visitor rows" button

## install

```bash
pnpm add @plugdash/heartpost
```

## register

```js
// astro.config.mjs
import emdash from "emdash/astro";
import { heartpostPlugin } from "@plugdash/heartpost";

export default defineConfig({
	integrations: [emdash({ plugins: [heartpostPlugin()] })],
});
```

## companion component

```astro
---
import HeartButton from "@plugdash/heartpost/HeartButton.astro";
---

<HeartButton post={post} />
```

| CSS property                     | Default                           |
| -------------------------------- | --------------------------------- |
| `--plugdash-heart-color`         | `var(--plugdash-accent, #6366f1)` |
| `--plugdash-heart-fill-duration` | `200ms`                           |

## configuration

| option             | type             | default     | description                                     |
| ------------------ | ---------------- | ----------- | ----------------------------------------------- |
| collections        | `string[]`       | `["posts"]` | Collections whose entries can be hearted        |
| rateLimitPerMinute | `number`         | `10`        | Hearts per client IP per minute, `0` is off     |
| trustProxyHeader   | `string \| null` | `null`      | Header carrying the client IP behind your proxy |
| label              | `string`         | `"hearts"`  | Label for the count                             |

## what it does not do

- No per-visitor rows and no fingerprints
- Cannot stop someone clearing localStorage and hearting again
- No hearts on drafts or entries outside `collections`

## for agents

After installing @plugdash/heartpost and registering it in astro.config.mjs:

1. Import the component in the post layout:
   `import HeartButton from "@plugdash/heartpost/HeartButton.astro"`
2. Add `<HeartButton post={post} />` where the button should show. Pass the entry
   from `getEmDashEntry`, not a copy with `data.id` removed.
3. Load a post, scroll to the button, click it. Verify:
   - one `GET .../heartpost/heart-status` fires when the button nears the viewport
   - clicking sends `POST .../heartpost/heart` and the count goes up by 1
   - `localStorage["plugdash-heart-<entry id>"]` is `"1"` and survives a reload
4. If the count never loads, confirm the entry is published and its collection is
   in `collections`. If hearts return 500, check the server log for the plugin error.
5. Upgrading from 0.2.x: open the admin, Plugins - Heart Post, and press
   "Remove old visitor rows".

Data written: KV `count:<entry id>` (integer). No metadata is written to the entry.
Companion component: HeartButton.astro
import: `import HeartButton from "@plugdash/heartpost/HeartButton.astro"`
usage: `<HeartButton post={post} />`
variants: circle (default) / pill / ghost
