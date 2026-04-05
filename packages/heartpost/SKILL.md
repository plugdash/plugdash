---
name: heartpost
description: KV-backed heart/like button plugin for EmDash. Increments a per-post counter on click, deduplicated by visitor fingerprint. Ships HeartButton.astro companion component.
---

# @plugdash/heartpost

Adds a heart/like button to EmDash content. Readers heart a post once per fingerprint; the count persists in KV. Ships HeartButton.astro with a fill animation.

## Plugin type

Standard

## Capabilities declared

```
read:content
write:content
```

## Hooks

- `plugin:install` - seeds default config (collections, label) to KV
- `content:afterSave` - initialises heart count to 0 on first publish (idempotent)

## Routes

- `heart` (POST, public) - increments count, stores fingerprint, returns `{ count, hearted }`
- `heart-status` (GET, public) - returns `{ count, hearted }` for current visitor

## Install

```bash
pnpm add @plugdash/heartpost
```

## Register

```js
// astro.config.mjs
import { defineConfig } from "astro/config";
import emdash from "emdash";
import { heartpostPlugin } from "@plugdash/heartpost";

export default defineConfig({
  integrations: [
    emdash({
      plugins: [heartpostPlugin()],
    }),
  ],
});
```

## Companion component

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

## Configuration

| Option      | Type       | Default    | Description                                  |
| ----------- | ---------- | ---------- | -------------------------------------------- |
| collections | `string[]` | all        | Limit processing to specific collection slugs |
| label       | `string`   | `"hearts"` | Label for the heart count                     |

## What it does not do

- Does not process drafts, archived, or scheduled content
- Does not support unhearting
- Does not provide atomic increment (acceptable for like counters)
- Does not store PII - only a truncated hash of IP + User-Agent
- Does not require authentication

## For agents

After installing @plugdash/heartpost and registering it in astro.config.mjs:

0. To configure without code: navigate to EmDash admin - Plugins - Heart
   Post - Settings. Label and collections allowlist are available in the
   dashboard.

1. Import HeartButton in the post layout:
   ```
   import HeartButton from "@plugdash/heartpost/HeartButton.astro"
   ```

2. Add the component where the heart button should display:
   ```
   <HeartButton post={post} />
   ```
   Common placements: below post title, in engagement bar alongside share buttons, in post footer.

3. For the engagement bar layout with sharepost and shortlink:
   ```
   <div style="display: flex; gap: 0.375rem; align-items: center;">
     <HeartButton post={post} variant="pill" />
     <ShareButtons post={post} variant="circle" />
     <CopyLink post={post} variant="circle" />
   </div>
   ```

4. Publish a test post and verify:
   - The heart button renders with the outline heart icon
   - Clicking the heart fills it with the accent color (bottom-to-top animation)
   - The count increments by 1
   - Clicking again does not increment further

5. If the button does not render, confirm the post object has an `id` property.
   If the count does not update, check that the plugin routes are accessible at
   `/_emdash/api/plugins/heartpost/heart` and `/_emdash/api/plugins/heartpost/heart-status`.

KV keys written by this plugin:
- `heartpost:[contentId]:count` - integer, total heart count
- `heartpost:[contentId]:[fingerprint]` - "1", dedup marker

Companion component: HeartButton.astro
import: `import HeartButton from "@plugdash/heartpost/HeartButton.astro"`
usage: `<HeartButton post={post} />`
variants: circle (default) / pill / ghost
