---
name: socialcard
description: Share image generator for EmDash. Renders a PNG card on publish and sets it as the entry's SEO image, which og:image already reads.
---

# @plugdash/socialcard

## What it does

On publish, draws a 1200x630 PNG card with the title, author and date, uploads it to media, and sets it as the entry's `seo.image`. The template's `getSeoMeta()` turns that into the `og:image` and `twitter:image` tags.

## Plugin type

Native

## Capabilities declared

```
content:read
content:write
media:write
schema:read
```

## Hooks

- `content:afterPublish` (timeout 30000) - renders, uploads and sets `seo.image`. Skips when nothing changed since the last card, when `seo.image` was set by hand, and for collections without SEO support.

## Install

```bash
pnpm add @plugdash/socialcard
```

## Register

```js
// astro.config.mjs
import { defineConfig } from "astro/config";
import emdash from "emdash/astro";
import { socialcardPlugin } from "@plugdash/socialcard";

export default defineConfig({
	integrations: [
		emdash({
			plugins: [socialcardPlugin()],
		}),
	],
});
```

## Companion component

None. The card is the visual output, and the site's existing SEO head tags show it.

## Configuration

| Option            | Type                                   | Default     | Description                              |
| ----------------- | -------------------------------------- | ----------- | ---------------------------------------- |
| template          | `"default"` \| `"minimal"` \| `"bold"` | `"default"` | Card layout                              |
| width             | `number`                               | `1200`      | Card width in pixels                     |
| height            | `number`                               | `630`       | Card height in pixels                    |
| background        | `string` (hex)                         | `"#0f172a"` | Background colour                        |
| foreground        | `string` (hex)                         | `"#f8fafc"` | Text colour                              |
| logo              | `string`                               | none        | http(s) URL or file path (Node)          |
| fontFiles         | `string[]`                             | none        | Extra TTF/OTF fonts for non-Latin titles |
| overwriteSeoImage | `boolean`                              | `false`     | Replace an SEO image someone set by hand |

## What it does not do

- Does not write `metadata.ogImage` (0.1.x did)
- Does not render on autosave or draft save
- Does not delete the card when a post is unpublished
- Has no admin page

## For agents

After installing @plugdash/socialcard and registering it in `plugins` (not `sandboxed`) in astro.config.mjs:

1. Make sure the post collection has SEO enabled (the blog template's `posts` does).

2. Make sure the post page builds SEO tags the way the blog template does: `getSeoMeta(post, { siteUrl: Astro.url.origin, ... })` in `src/pages/posts/[slug].astro`, rendered by `<EmDashHead>` in the layout. Passing `Astro.url.origin` is what makes the stored root-relative URL absolute.

3. Publish a post. The server log shows `[plugin:socialcard] card generated { id, url, bytes, renderMs }`.

4. Load the post page and check that `<meta property="og:image">` points to a URL that returns `200` with `content-type: image/png`.

5. If there is no card:
   - The log says `has no SEO support`: enable SEO on that collection.
   - The log says `SEO image was set by hand`: clear `seo.image` or pass `overwriteSeoImage: true`.
   - The log says `card unchanged, skipping render`: nothing changed since the last card, so this is expected.

Fields written:

- `entry.seo.image` - string, root-relative media URL like `/_emdash/api/media/file/<key>.png`

KV keys: `hash:<id>` (last card hash), `media:<id>` (`{ mediaId, url }` of the current card).
