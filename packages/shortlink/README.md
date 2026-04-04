# @plugdash/shortlink

Every CMS post deserves a short URL, but most setups leave that to external services.
Generates short URLs backed by EmDash's KV store and writes them to post metadata on publish.
Ships `CopyLink.astro` - a copy-to-clipboard button that fits the engagement bar.
The EmDash equivalent of [Pretty Links](https://wordpress.org/plugins/pretty-link/) (basic tier).

## Install

```bash
pnpm add @plugdash/shortlink
```

## Register

```js
// astro.config.mjs
import { defineConfig } from "astro/config";
import emdash from "emdash";
import { shortlinkPlugin } from "@plugdash/shortlink";

export default defineConfig({
  integrations: [
    emdash({
      plugins: [shortlinkPlugin()],
    }),
  ],
});
```

## Add the redirect page

The plugin owns shortlink logic. Your theme owns routing. Add this Astro
page to wire up `/s/[code]` redirects:

```typescript
// src/pages/s/[code].ts
import type { APIRoute } from "astro";

export const GET: APIRoute = async ({ params, redirect }) => {
  const res = await fetch(
    `${import.meta.env.SITE}/_emdash/api/plugins/shortlink/resolve?code=${params.code}`
  );
  const json = await res.json();
  if (!json.success || !json.data?.target) return new Response(null, { status: 404 });
  if (json.data.expired) return new Response("Gone", { status: 410 });
  return redirect(json.data.target, 301);
};
```

This is the only setup step beyond plugin registration. Agents can wire
this in with a single file write - see SKILL.md for the exact instructions.

## Config options

Configuration is stored in the plugin's KV store and can be changed via the
admin UI at `/_emdash/admin/shortlinks`. Defaults are seeded on install.

| Option     | Type      | Default | Description                                        |
| ---------- | --------- | ------- | -------------------------------------------------- |
| prefix     | `string`  | `/s/`   | Route prefix for short URLs                        |
| codeLength | `number`  | `4`     | Length of auto-generated codes (2-12)              |
| autoCreate | `boolean` | `true`  | Create shortlinks automatically on publish         |
| domain     | `string`  | site URL | Custom domain for full short URLs                 |

## Companion component

```astro
---
import CopyLink from "@plugdash/shortlink/CopyLink.astro";
---

<CopyLink post={post} />
```

### Props

| Prop    | Type                             | Default    | Description                    |
| ------- | -------------------------------- | ---------- | ------------------------------ |
| post    | `Record<string, unknown>`        | required   | The post object from EmDash    |
| showUrl | `boolean`                        | `false`    | Show short URL text next to icon |
| variant | `"circle" \| "pill" \| "ghost"` | `"circle"` | Visual style                   |
| size    | `"sm" \| "md" \| "lg"`          | `"md"`     | Button size                    |
| theme   | `"auto" \| "dark" \| "light"`   | `"auto"`   | Color theme                    |
| class   | `string`                         | `""`       | Additional CSS class           |

### CSS custom properties

| Token                              | Default                                  | Description         |
| ---------------------------------- | ---------------------------------------- | ------------------- |
| `--plugdash-engage-size`           | `2rem`                                   | Circle button size  |
| `--plugdash-engage-radius`         | `9999px`                                 | Border radius       |
| `--plugdash-engage-border`         | `rgb(from currentColor r g b / 0.15)`    | Border color        |
| `--plugdash-engage-bg`             | `rgb(from currentColor r g b / 0.04)`    | Background          |
| `--plugdash-engage-bg-hover`       | `rgb(from currentColor r g b / 0.08)`    | Hover background    |
| `--plugdash-engage-transition`     | `150ms ease`                             | Transition timing   |
| `--plugdash-copy-success-color`    | `#22c55e`                                | Check icon color    |
| `--plugdash-copy-success-duration` | `2000ms`                                 | Check display time  |
| `--plugdash-font-ui`              | `"Lexend", system-ui, sans-serif`         | UI font family      |
| `--plugdash-font-mono`            | `"IBM Plex Mono", monospace`              | URL text font       |

## Metadata written

On publish, writes to `post.data.metadata.shortlink`:

```typescript
{
  code: string    // e.g. "ab3k"
  url: string     // e.g. "/s/ab3k"
  fullUrl: string // e.g. "https://example.com/s/ab3k"
}
```

## What it does

- Fires on `content:afterSave` when status is `published`
- Generates a random alphanumeric code (configurable length)
- Stores shortlink data in KV with a reverse index for O(1) duplicate checks
- Writes shortlink metadata to the content record (read-merge-write)
- Provides a public `resolve` route for redirect lookup
- Ships a Block Kit admin page for managing shortlinks and creating custom slugs
- Handles code collisions with retry and length escalation

## What it does not do

- Does not create shortlinks for drafts, archived, or scheduled content
- Does not handle the HTTP redirect itself - your theme provides the `/s/[code]` page
- Does not track click counts - that is the clickcount plugin's job
- Does not generate cryptographically random codes - do not use shortlinks for secret or access-controlled URLs
- Does not delete shortlinks when content is deleted (orphaned links stay until manually removed via admin)
- Does not support custom slugs via the content editor - use the admin page
