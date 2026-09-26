---
name: socialcard
description: OG social card generator for EmDash. Builds a share image on publish and writes it to content metadata as ogImage.
---

# @plugdash/socialcard

Generates an Open Graph share image for EmDash content on publish. Writes `metadata.ogImage` with the uploaded image URL. Three built-in templates, no external image service.

## Plugin type

Standard

## Capabilities declared

```
content:read
content:write
media:write
```

## Hooks

- `plugin:install` - seeds config to KV (template, width, height, colours, fonts, logo)
- `content:afterSave` - renders and uploads a card on publish, skips drafts

## Install

```bash
pnpm add @plugdash/socialcard
```

## Register

```js
// astro.config.mjs
import { defineConfig } from "astro/config";
import emdash from "emdash";
import { socialcardPlugin } from "@plugdash/socialcard";

export default defineConfig({
  integrations: [
    emdash({
      plugins: [socialcardPlugin()],
    }),
  ],
});
```

## Configuration

| Option        | Type                                 | Default     | Description                          |
| ------------- | ------------------------------------- | ----------- | ------------------------------------- |
| template      | `"default"` \| `"minimal"` \| `"bold"` | `"default"` | Card layout                           |
| width         | `number`                              | `1200`      | Card width in pixels                  |
| height        | `number`                              | `630`       | Card height in pixels                 |
| background    | `string` (hex)                        | `"#0f172a"` | Background colour                     |
| foreground    | `string` (hex)                        | `"#f8fafc"` | Text (and, on `minimal`, paper) colour |
| logo          | `string` (URL)                        | none        | Logo drawn in the top-left corner     |
| fonts.title   | `string` (CSS font stack)             | system sans | Font for the title line               |
| fonts.body    | `string` (CSS font stack)             | system sans | Font for the byline                   |

## What it does not do

- Does not rasterize to PNG - ships an `image/svg+xml` card (see below)
- Does not fail the publish if rendering or upload fails - logs and moves on
- Does not generate cards for drafts, archived, or scheduled content
- Does not delete a previously uploaded card when content is unpublished

### Why SVG, not PNG

The spec called for `satori` + `resvg-js` to rasterize to PNG. Neither ships
a Workers-safe build that a sandboxed plugin bundle can load (both need a
font binary or a `.wasm` blob at runtime, and a sandboxed plugin ships one
JS file with no network capability). Every other plugin in this repo has
zero runtime dependencies for the same reason. The card is built as a plain
SVG string instead - deterministic, dependency-free, testable with `expect().toContain()`.

Some OG consumers (Twitter/X, Facebook) do not accept `image/svg+xml` for
`og:image`, so treat this as the interim output. Upgrade path: once a
sandboxed plugin can ship a binary asset alongside its entry bundle, swap
`renderCard`'s return in `src/card.ts` for a satori → resvg → PNG pipeline
and update `CARD_MIME`. The layout math (wrapping, positions, templates)
carries over unchanged.

## For agents

After installing @plugdash/socialcard and registering it in astro.config.mjs:

1. Publish a test post and verify `post.data.metadata.ogImage` is populated
   with a URL ending in `.svg`.

2. Reference it in your post layout's `<head>`:
   ```astro
   ---
   const { ogImage } = post.data.metadata ?? {};
   ---
   {ogImage && <meta property="og:image" content={ogImage} />}
   ```

3. If no `ogImage` appears, confirm:
   - Post status is "published" (not draft)
   - The plugin declares `content:read`, `content:write`, and `media:write`
   - The post was saved after the plugin was installed (existing posts need a re-publish)

Metadata written:
- `post.data.metadata.ogImage` - string, URL to the generated card image
