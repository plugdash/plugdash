# @plugdash/socialcard

Open Graph share image generation for EmDash content.
Writes `metadata.ogImage` to post metadata on publish.
The EmDash equivalent of Social Image Generator / Yoast's OG image feature.

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
      // or sandboxed: [socialcardPlugin()]
    }),
  ],
});
```

## Configuration

### astro.config.mjs

Pass config at register time. Values are seeded into KV on install and
reseeded automatically when the config in code changes.

```js
socialcardPlugin({
  template: "bold",
  background: "#111827",
  foreground: "#fef3c7",
  logo: "https://example.com/logo.png",
});
```

| Option        | Type                                   | Default     | Description                            |
| ------------- | --------------------------------------- | ----------- | --------------------------------------- |
| template      | `"default"` \| `"minimal"` \| `"bold"`  | `"default"` | Card layout                             |
| width         | `number`                                | `1200`      | Card width in pixels                    |
| height        | `number`                                | `630`       | Card height in pixels                   |
| background    | `string` (hex)                          | `"#0f172a"` | Background colour                       |
| foreground    | `string` (hex)                          | `"#f8fafc"` | Text (and, on `minimal`, paper) colour  |
| logo          | `string` (URL)                          | none        | Logo drawn in the top-left corner       |
| fonts.title   | `string` (CSS font stack)               | system sans | Font stack for the title line           |
| fonts.body    | `string` (CSS font stack)               | system sans | Font stack for the byline               |

## Astro theme usage

Reference the generated card as the page's `og:image`:

```astro
---
const post = await emdash.content.get("posts", Astro.params.id);
const { ogImage } = post.data.metadata ?? {};
---

{ogImage && <meta property="og:image" content={ogImage} />}
{ogImage && <meta property="og:image:width" content="1200" />}
{ogImage && <meta property="og:image:height" content="630" />}
```

## Templates

- `default` - large title, small author + date byline, subtle gradient
- `minimal` - title only, clean paper background
- `bold` - large type against a strong colour block

Long titles (over 80 characters) are truncated with an ellipsis. A missing
author simply drops the byline's author half; a missing date drops the date
half. If neither is available, the byline is omitted entirely.

## What it does

- Fires on `content:afterSave` when status is `published`
- Extracts title, author, and publish date from the content item
- Renders one of three templates as an SVG card
- Uploads the card via `ctx.media.upload` and writes the URL to `metadata.ogImage`
- Overwrites the same filename on republish, so no orphaned assets accumulate
- Preserves existing metadata keys from other plugins
- Never fails the publish - a rendering or upload error is logged, not thrown

## What it does not do

- Does not rasterize to PNG - see "Why SVG, not PNG" below
- Does not generate cards for drafts, archived, or scheduled content
- Does not support server-fetched fonts or Google Fonts URLs (CSS font
  stacks only - the renderer has no network access)
- Does not delete a previously uploaded card when content is unpublished

### Why SVG, not PNG

The original spec called for `satori` (JSX to SVG) plus `resvg-js` (SVG to
PNG) running natively in a Worker. Neither has a build that a *sandboxed*
plugin bundle can load: both need a font binary or a `.wasm` blob fetched at
runtime, and a sandboxed plugin ships as a single bundled JS file with no
network capability to fetch one. Every other plugin in this monorepo has
zero runtime dependencies for the same reason - adding either package would
mean vendoring binary assets no sibling plugin's build pipeline supports yet.

The card is built as a hand-assembled SVG string instead: deterministic, no
dependencies, and directly testable. Some OG consumers (notably Twitter/X
and Facebook) reject `image/svg+xml` for `og:image`, so this is an interim
format, not the end state. Upgrade path: once a sandboxed plugin can ship a
binary asset alongside its entry bundle, swap `renderCard`'s return value in
`src/card.ts` for a satori → resvg → PNG pipeline and update `CARD_MIME`
accordingly. The layout math (word wrapping, positions, per-template
structure) carries over unchanged - only the final output format is stubbed.
