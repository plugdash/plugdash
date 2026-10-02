# @plugdash/socialcard

**@plugdash/socialcard** - posts shared on X, LinkedIn, Slack or Facebook show up as a bare link when they have no share image. On publish, this plugin draws a 1200x630 PNG card with the post title, author and date, stores it in your media library, and sets it as the post's SEO image. Your template's existing `og:image` tag picks it up with no template changes. The EmDash equivalent of Social Image Generator / Yoast's OG image feature.

## Install

```bash
pnpm add @plugdash/socialcard
```

## Register

It is a native plugin, so it goes in `plugins`, not `sandboxed`.

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

## How it works

1. You publish a post (or a page, or any collection with SEO enabled).
2. After the publish response goes out, the plugin builds the card as SVG and rasterises it to PNG with [resvg-wasm](https://github.com/yisibl/resvg-js).
3. The PNG is uploaded as `og-<id>.png` (`image/png`) through `ctx.media.upload`, so it lives wherever your media lives (local `uploads/`, R2, S3).
4. The plugin sets the entry's `seo.image` to the media URL, for example `/_emdash/api/media/file/01M3....png`. This is an SEO-only update: it goes live at once and does not create a draft.
5. `getSeoMeta()` turns that root-relative path into an absolute URL using the `siteUrl` you pass it. The blog template passes `Astro.url.origin`, so `og:image` always matches the host the page was served from. `EmDashHead` then writes the `og:image` and `twitter:image` tags.

If your template does not use `getSeoMeta()`, read `post.seo.image` and prefix it with `Astro.url.origin`.

### What it skips

- **Unchanged posts.** The plugin hashes title, author, publish date, your config and the plugin version, and keeps the hash in KV. Re-publishing without a change logs `card unchanged, skipping render` and does nothing else.
- **Autosaves and draft saves.** Only `content:afterPublish` is hooked.
- **A hand-set SEO image.** If someone sets `seo.image` in the admin, the plugin leaves it alone unless you pass `overwriteSeoImage: true`.
- **Collections without SEO support.** Logged once per collection, then ignored.

When a card is redrawn (say the title changed), the new PNG is uploaded first and the old media item is deleted, so cards do not pile up in your media library.

## Configuration

```js
socialcardPlugin({
	template: "bold",
	background: "#111827",
	foreground: "#fef3c7",
	logo: "https://example.com/logo.png",
});
```

| Option            | Type                                   | Default     | Description                                                  |
| ----------------- | -------------------------------------- | ----------- | ------------------------------------------------------------ |
| template          | `"default"` \| `"minimal"` \| `"bold"` | `"default"` | Card layout                                                  |
| width             | `number`                               | `1200`      | Card width in pixels                                         |
| height            | `number`                               | `630`       | Card height in pixels                                        |
| background        | `string` (hex)                         | `"#0f172a"` | Background colour                                            |
| foreground        | `string` (hex)                         | `"#f8fafc"` | Text (and, on `minimal`, paper) colour                       |
| logo              | `string`                               | none        | Logo in the top-left corner: http(s) URL or file path (Node) |
| fontFiles         | `string[]`                             | none        | Extra TTF/OTF fonts: http(s) URLs or file paths (Node)       |
| overwriteSeoImage | `boolean`                              | `false`     | Replace an SEO image someone set by hand                     |

Changing any option changes the hash, so every post gets a new card on its next publish.

## Templates

- `default` - large title, author and date byline, subtle gradient
- `minimal` - title only, clean paper background
- `bold` - large type against a strong colour block

Long titles (over 80 characters) are cut with an ellipsis. The author comes from a `data.author` field (string or `{ name }`), then the post's primary byline. A missing author or date drops that half of the byline.

## Fonts

The package bundles Lexend Regular and Bold, Latin subset (about 24 KB each, SIL Open Font License, see `OFL-Lexend.txt`). Titles in other scripts need a font that has those glyphs, or they render as empty boxes. Add one with `fontFiles`; it is used as a fallback for any character Lexend does not have:

```js
socialcardPlugin({
	// Hindi titles
	fontFiles: ["./fonts/NotoSansDevanagari-Bold.ttf"],
});
```

Use a file path on Node, or an http(s) URL on any runtime. Prefer a subset or a single weight: the font is loaded on every render.

## Performance

Measured on Node 24, Apple M-series, default 1200x630:

- First render after a server start: about 80-110 ms (includes compiling the WASM module)
- Later renders: about 20-45 ms
- PNG size: about 310-340 KB for `default` (the gradient does not compress well), about 37 KB for `minimal`, about 56 KB for `bold`

The work runs after the publish response, so editors do not wait for it. The hook timeout is 30 seconds, mostly to bound a slow logo or font fetch.

resvg and the fonts are loaded with `await import()` inside the hook. A normal page request never loads them.

## What it does not do

- Does not write `metadata.ogImage` any more (0.1.x did). Use `seo.image`.
- Does not draw cards for drafts or on autosave
- Does not delete the card when a post is unpublished
- Does not fetch Google Fonts by name. Pass a font file with `fontFiles`.
- Has no admin page. Configure it in `astro.config.mjs`.

## Cloudflare Workers

The Workers path is not verified yet. workerd does not allow compiling WASM from bytes, so on Workers the plugin imports `@resvg/resvg-wasm/index_bg.wasm?module` and expects the bundler to hand it a compiled module. File paths in `logo` and `fontFiles` do not work there; use URLs.
