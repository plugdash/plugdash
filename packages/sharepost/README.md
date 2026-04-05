# @plugdash/sharepost

Adding share buttons to a blog post should not require loading a third-party script.
Generates sharing URLs for Twitter/X, LinkedIn, WhatsApp, Bluesky, and email on publish
and writes them to content metadata. Ships `ShareButtons.astro` - a zero-JavaScript
component that renders share links as plain anchor tags.
The EmDash equivalent of [Social Warfare](https://warfareplugins.com/) / [AddToAny](https://wordpress.org/plugins/add-to-any/) (basic tier).

## Install

```bash
pnpm add @plugdash/sharepost
```

## Register

```js
// astro.config.mjs
import { defineConfig } from "astro/config";
import emdash from "emdash";
import { sharepostPlugin } from "@plugdash/sharepost";

export default defineConfig({
  integrations: [
    emdash({
      plugins: [sharepostPlugin()],
    }),
  ],
});
```

## Configuration

### Admin dashboard

After installing, open the EmDash admin and go to Plugins - Share Post -
Settings. All configuration options are available there. Changes take
effect on the next publish - no code changes required.

### Config options

Configuration is stored in the plugin's KV store. Defaults are seeded on install.

| Option    | Type       | Default                                              | Description                          |
| --------- | ---------- | ---------------------------------------------------- | ------------------------------------ |
| platforms | `string[]` | `["twitter", "linkedin", "whatsapp", "bluesky", "email"]` | Platforms to generate share URLs for |
| via       | `string`   | none                                                 | Twitter @handle without the @        |
| hashtags  | `string[]` | none                                                 | Twitter hashtags without #           |

## Companion component

```astro
---
import ShareButtons from "@plugdash/sharepost/ShareButtons.astro";
---

<ShareButtons post={post} />
```

### Props

| Prop        | Type                                                         | Default                             | Description                       |
| ----------- | ------------------------------------------------------------ | ----------------------------------- | --------------------------------- |
| post        | `Record<string, unknown>`                                    | required                            | The post object from EmDash       |
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

## Metadata written

On publish, writes to `post.data.metadata.shareUrls`:

```typescript
{
  twitter: "https://twitter.com/intent/tweet?text=...",
  linkedin: "https://www.linkedin.com/sharing/share-offsite/?url=...",
  whatsapp: "https://api.whatsapp.com/send?text=...",
  bluesky: "https://bsky.app/intent/compose?text=...",
  email: "mailto:?subject=...&body=..."
}
```

Only configured platforms appear in the object.

## What it does

- Fires on `content:afterSave` when status is `published`
- Reads post title from `event.content.data.title` (falls back to collection name)
- Builds absolute post URL from `ctx.url()` and slug
- Generates platform-specific share URLs with proper encoding
- Truncates title to 200 chars for Twitter only
- Reads existing content to merge metadata (preserves other plugins' fields)
- Appends `via` and `hashtags` to Twitter URLs when configured

## What it does not do

- Does not make external HTTP calls - all URLs are constructed locally
- Does not require client-side JavaScript - share links are plain anchor tags
- Does not track share clicks - that is analytics territory
- Does not generate share URLs for drafts, archived, or scheduled content
- Does not generate share URLs for posts without a slug
- Does not create Open Graph images - see @plugdash/socialcard for that
