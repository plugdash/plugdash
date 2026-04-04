# @plugdash/engage

Three engagement plugins need three separate imports and three sets of props to keep visually consistent. @plugdash/engage bundles heartpost + sharepost + shortlink and ships a single `EngagementBar.astro` component that renders all three in one coherent row. Only on EmDash - engagement in one import.

## Install

```bash
pnpm add @plugdash/engage
```

This installs `@plugdash/heartpost`, `@plugdash/sharepost`, and `@plugdash/shortlink` automatically.

## Register

engage itself is not a plugin - register the three underlying plugins individually:

```js
// astro.config.mjs
import { defineConfig } from "astro/config";
import emdash from "emdash";
import { heartpostPlugin } from "@plugdash/heartpost";
import { sharepostPlugin } from "@plugdash/sharepost";
import { shortlinkPlugin } from "@plugdash/shortlink";

export default defineConfig({
  integrations: [
    emdash({
      plugins: [
        heartpostPlugin(),
        sharepostPlugin({ via: "yourhandle" }),
        shortlinkPlugin(),
      ],
    }),
  ],
});
```

## Companion component

```astro
---
import EngagementBar from "@plugdash/engage/EngagementBar.astro"
---

<!-- all defaults -->
<EngagementBar post={post} />

<!-- customised -->
<EngagementBar
  post={post}
  variant="pill"
  size="sm"
  platforms={["twitter", "bluesky"]}
  attribution={true}
/>

<!-- share + copy only -->
<EngagementBar post={post} showHeart={false} />
```

## Props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `post` | `Record<string, unknown>` | required | EmDash content item |
| `platforms` | `Array<"twitter" \| "linkedin" \| "whatsapp" \| "bluesky" \| "email">` | `["twitter", "linkedin", "bluesky"]` | Platforms for share buttons |
| `variant` | `"circle" \| "pill" \| "ghost"` | `"circle"` | Visual style applied to all children |
| `size` | `"sm" \| "md" \| "lg"` | `"md"` | Size applied to all children |
| `theme` | `"auto" \| "dark" \| "light"` | `"auto"` | Theme applied to all children |
| `showHeart` | `boolean` | `true` | Show/hide HeartButton |
| `showShare` | `boolean` | `true` | Show/hide ShareButtons |
| `showCopy` | `boolean` | `true` | Show/hide CopyLink |
| `attribution` | `boolean` | `false` | Show plugdash attribution on share buttons |
| `class` | `string` | `""` | Additional CSS class on the container |

## CSS custom properties

The engagement bar container uses one token. All visual styling is controlled by the child components' own tokens.

| Token | Default | Description |
| --- | --- | --- |
| `--plugdash-engage-gap` | `0.375rem` | Gap between child components |
| `--plugdash-engage-size` | `2rem` | Button size (circle variant) |
| `--plugdash-engage-radius` | `9999px` | Border radius |
| `--plugdash-engage-border` | `rgb(from currentColor r g b / 0.15)` | Border colour |
| `--plugdash-engage-bg` | `rgb(from currentColor r g b / 0.04)` | Background colour |
| `--plugdash-engage-bg-hover` | `rgb(from currentColor r g b / 0.08)` | Hover background colour |
| `--plugdash-engage-transition` | `150ms ease` | Transition timing |
| `--plugdash-heart-color` | `var(--plugdash-accent, #6366f1)` | Heart fill colour |
| `--plugdash-heart-fill-duration` | `200ms` | Heart fill animation speed |
| `--plugdash-copy-success-color` | `#22c55e` | Copy success checkmark colour |

## What it does not do

- Does not contain any plugin logic, hooks, or sandbox-entry - it is a convenience wrapper
- Does not work without all three sub-plugins - if you only want one or two, import them directly
- Does not expose the "filled" variant (only available on ShareButtons individually)
- Does not add any metadata to posts - the three sub-plugins handle that independently
