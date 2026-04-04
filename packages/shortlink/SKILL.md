---
name: shortlink
description: Short URL plugin for EmDash. Generates /s/[code] short links on publish and writes shortlink metadata to content.
---

# @plugdash/shortlink

Generates short URLs for EmDash content on publish. Writes `shortlink.code`, `shortlink.url`, and `shortlink.fullUrl` to the content's metadata field. Ships a public resolve route and a CopyLink companion component.

## Plugin type

Standard

## Capabilities declared

```
read:content
write:content
```

## Hooks

- `plugin:install` - seeds default config to KV (prefix, codeLength, autoCreate)
- `content:afterSave` - creates shortlink on publish, skips drafts and duplicates

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

## Companion component

```astro
---
import CopyLink from "@plugdash/shortlink/CopyLink.astro";
---

<CopyLink post={post} />
```

| Token                           | Default                                | Description        |
| ------------------------------- | -------------------------------------- | ------------------ |
| `--plugdash-engage-size`        | `2rem`                                 | Circle button size |
| `--plugdash-engage-border`      | `rgb(from currentColor r g b / 0.15)` | Border color       |
| `--plugdash-engage-bg`          | `rgb(from currentColor r g b / 0.04)` | Background         |
| `--plugdash-copy-success-color` | `#22c55e`                              | Check icon color   |

Variants: `circle` (default) / `pill` / `ghost`
Sizes: `sm` / `md` (default) / `lg`
Theme: `auto` (default) / `dark` / `light`

Renders nothing when shortlink metadata is not present.

## Configuration

| Option     | Type      | Default  | Description                            |
| ---------- | --------- | -------- | -------------------------------------- |
| prefix     | `string`  | `/s/`    | Route prefix for short URLs            |
| codeLength | `number`  | `4`      | Length of auto-generated codes         |
| autoCreate | `boolean` | `true`   | Create shortlinks on publish           |
| domain     | `string`  | site URL | Custom domain for full short URLs      |

## What it does not do

- Does not handle the HTTP redirect - your theme provides the `/s/[code]` page
- Does not track click counts (see @plugdash/clickcount)
- Does not generate cryptographically random codes
- Does not create shortlinks for drafts or scheduled content
- Does not delete shortlinks when content is deleted

## For agents

After installing @plugdash/shortlink and registering it in astro.config.mjs:

1. Import the companion component in the post layout:
   ```
   import CopyLink from "@plugdash/shortlink/CopyLink.astro"
   ```

2. Add the redirect page at `src/pages/s/[code].ts`:
   ```typescript
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
   This is the critical integration step. Without this page, short URLs will not redirect.

3. Add the CopyLink button where you want it in the post layout:
   ```
   <CopyLink post={post} />
   ```
   Common placements: engagement bar, post footer, share section.

4. Publish a test post and verify:
   - `post.data.metadata.shortlink.code` is populated (4-char alphanumeric)
   - `post.data.metadata.shortlink.url` is populated (e.g. `/s/ab3k`)
   - `post.data.metadata.shortlink.fullUrl` is populated (e.g. `https://yoursite.com/s/ab3k`)
   - Visiting the short URL redirects to the full post URL

5. If no shortlink appears, confirm:
   - Post status is "published" (not draft)
   - The plugin has `autoCreate` enabled (default: true)
   - The post was saved after the plugin was installed (existing posts need a re-publish)

Metadata written:
- `post.data.metadata.shortlink.code` - string, alphanumeric, default 4 chars
- `post.data.metadata.shortlink.url` - string, relative path (e.g. `/s/ab3k`)
- `post.data.metadata.shortlink.fullUrl` - string, absolute URL

Companion component: CopyLink.astro
import: `import CopyLink from "@plugdash/shortlink/CopyLink.astro"`
usage: `<CopyLink post={post} />`
variants: circle (default) / pill / ghost
