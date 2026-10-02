# @plugdash/sharepost

Adding share buttons to a blog post should not require loading a third-party script.
Builds sharing links for Twitter/X, LinkedIn, WhatsApp, Bluesky, and email when the
page renders, from the current URL and the post title. Ships `ShareButtons.astro` - a
zero-JavaScript component that renders share links as plain anchor tags. No hooks, no
database reads or writes.
The EmDash equivalent of [Social Warfare](https://warfareplugins.com/) / [AddToAny](https://wordpress.org/plugins/add-to-any/) (basic tier).

## Install

```bash
pnpm add @plugdash/sharepost
```

## Register

Nothing to register. `sharepostPlugin()` still exists as a no-op so older
`astro.config.mjs` files keep working, but it is deprecated and ignores its options.

Set `site` in `astro.config.mjs` so links use your public domain behind a proxy or CDN.
Without it, links use the origin of the incoming request.

```js
// astro.config.mjs
import { defineConfig } from "astro/config";
import emdash from "emdash/astro";

export default defineConfig({
  site: "https://example.com",
  integrations: [emdash({})],
});
```

## Companion component

```astro
---
import ShareButtons from "@plugdash/sharepost/ShareButtons.astro";
---

<ShareButtons post={post} via="yourhandle" />
```

### Props

| Prop        | Type                                                         | Default                             | Description                       |
| ----------- | ------------------------------------------------------------ | ----------------------------------- | --------------------------------- |
| post        | `Record<string, unknown>`                                    | none                                | Post from `getEmDashEntry()`. Only used for the title |
| url         | `string`                                                     | current page, as an absolute URL    | URL to share                      |
| title       | `string`                                                     | `post.data.title`                   | Share text                        |
| via         | `string`                                                     | none                                | X/Twitter handle without the @, X link only |
| hashtags    | `string[]`                                                   | none                                | X/Twitter hashtags without #, X link only |
| platforms   | `Array<"twitter" \| "linkedin" \| "whatsapp" \| "bluesky" \| "email">` | `["twitter", "linkedin", "bluesky"]` | Which buttons to show             |
| variant     | `"circle" \| "pill" \| "ghost" \| "filled"`                 | `"circle"`                          | Visual style                      |
| size        | `"sm" \| "md" \| "lg"`                                      | `"md"`                              | Button size                       |
| theme       | `"auto" \| "dark" \| "light"`                               | `"auto"`                            | Color theme                       |
| attribution | `boolean`                                                    | `false`                             | Show "by plugdash" link           |
| class       | `string`                                                     | `""`                                | Additional CSS class              |

### CSS custom properties

| Token                          | Default                                | Description       |
| ------------------------------ | -------------------------------------- | ----------------- |
| `--plugdash-engage-gap`        | `0.375rem`                             | Button spacing    |
| `--plugdash-engage-size`       | `2rem`                                 | Circle button size |
| `--plugdash-engage-radius`     | `9999px`                               | Border radius     |
| `--plugdash-engage-border`     | `rgb(from currentColor r g b / 0.15)`  | Border color      |
| `--plugdash-engage-bg`         | `rgb(from currentColor r g b / 0.04)`  | Background        |
| `--plugdash-engage-bg-hover`   | `rgb(from currentColor r g b / 0.08)`  | Hover background  |
| `--plugdash-engage-transition` | `150ms ease`                           | Transition timing |
| `--plugdash-accent`            | `#6366f1`                              | Filled variant bg |
| `--plugdash-accent-fg`         | `#ffffff`                              | Filled variant fg |
| `--plugdash-font-ui`           | `"Lexend", system-ui, sans-serif`      | UI font family    |

## Platform hover colours

Each button tints to its platform brand colour on hover by default.

| Platform  | Default hover colour | CSS variable                         |
| --------- | -------------------- | ------------------------------------ |
| X/Twitter | `#1d9bf0`            | `--plugdash-share-twitter-color`     |
| LinkedIn  | `#0a66c2`            | `--plugdash-share-linkedin-color`    |
| Bluesky   | `#0085ff`            | `--plugdash-share-bluesky-color`     |
| WhatsApp  | `#25d366`            | `--plugdash-share-whatsapp-color`    |
| Email     | `--plugdash-accent`  | `--plugdash-share-email-color`       |

Override a platform's colour via the CSS variable:

```css
:root {
  --plugdash-share-twitter-color: #000000;  /* X black branding */
  --plugdash-share-linkedin-color: #004182;
}
```

Or target the per-platform class directly for custom hover treatments:

```css
.plugdash-share-btn--bluesky:hover { background: #0085ff; color: #fff; }
```

## What it does

- Builds the share links in the component on each render (about 0.007 ms for five links)
- Uses `url` if given, else the current page URL resolved against `Astro.site` or the request origin
- Reads the title from `title`, else `post.data.title`
- Encodes titles and URLs, so `& " <` are safe
- Truncates the title to 200 chars for X only
- Appends `via` and `hashtags` to the X link only

## What it does not do

- Does not make external HTTP calls - all URLs are constructed locally
- Does not require client-side JavaScript - share links are plain anchor tags
- Does not track share clicks - that is analytics territory
- Does not write to content or metadata, and registers no hooks
- Does not create Open Graph images - see @plugdash/socialcard for that
