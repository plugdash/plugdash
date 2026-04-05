# @plugdash/heartpost

Readers want to acknowledge a post without writing a comment.
Writes a KV-backed heart count per content item on click, deduplicated by
fingerprint. Ships HeartButton.astro - a drop-in heart button with a
bottom-to-top fill animation. No WordPress equivalent - only on EmDash.

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
      // or sandboxed: [heartpostPlugin()]
    }),
  ],
});
```

## Config options

Configuration is stored in the plugin's KV store and can be changed via the
admin UI or programmatically. Defaults are seeded on install.

| Option      | Type       | Default    | Description                                  |
| ----------- | ---------- | ---------- | -------------------------------------------- |
| collections | `string[]` | all        | Limit processing to specific collection slugs |
| label       | `string`   | `"hearts"` | Label for the heart count (admin display)     |

## Companion component

Exported as `@plugdash/heartpost/HeartButton.astro`.

```astro
---
import HeartButton from "@plugdash/heartpost/HeartButton.astro";
const post = await emdash.content.get("posts", Astro.params.id);
---

<HeartButton post={post} />
```

### Props

| Prop    | Type                               | Default    | Description                   |
| ------- | ---------------------------------- | ---------- | ----------------------------- |
| post    | `Record<string, unknown>`          | (required) | Content item - the component reads `post.id` or `post.data.id` (checks both) |
| variant | `"circle" \| "pill" \| "ghost"`    | `"circle"` | Visual style                  |
| size    | `"sm" \| "md" \| "lg"`            | `"md"`     | Component size                |
| theme   | `"auto" \| "dark" \| "light"`     | `"auto"`   | Color scheme                  |
| class   | `string`                           | `""`       | Additional CSS class          |

### Variants

- **circle** - heart icon in a rounded button, count hidden (default)
- **pill** - heart icon + count in a rounded pill
- **ghost** - heart icon + count, no border or background

### CSS custom properties

| Property                          | Default                            | Description          |
| --------------------------------- | ---------------------------------- | -------------------- |
| `--plugdash-heart-color`          | `var(--plugdash-accent, #6366f1)`  | Heart fill color     |
| `--plugdash-heart-fill-duration`  | `200ms`                            | Fill animation speed |
| `--plugdash-engage-size`          | `2rem`                             | Button size          |
| `--plugdash-engage-radius`        | `9999px`                           | Border radius        |
| `--plugdash-engage-border`        | `rgb(from currentColor r g b / 0.15)` | Border color      |
| `--plugdash-engage-bg`            | `rgb(from currentColor r g b / 0.04)` | Background color  |
| `--plugdash-engage-bg-hover`      | `rgb(from currentColor r g b / 0.08)` | Hover background  |

## How it works

- Initialises a heart count (0) in KV on first publish via `content:afterSave`
- Re-publish does not reset existing counts
- POST route increments count and stores a fingerprint hash (sha256 of IP + User-Agent, truncated to 16 chars)
- GET route returns current count and whether the current visitor has hearted
- Fingerprint dedup prevents double-counting, not rigorous identity verification
- No cookies, no accounts, no PII stored

## What it does not do

- Does not process drafts, archived, or scheduled content
- Does not provide atomic increment (uses KV get+set - occasional missed hearts under extreme concurrency are acceptable)
- Does not store any personally identifiable information
- Does not require authentication to heart a post
- Does not support unhearting (hearts are permanent)
- Does not provide an admin page for viewing heart counts (planned)
