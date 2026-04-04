---
name: sharepost
description: Social sharing URL plugin for EmDash. Generates share URLs for Twitter/X, LinkedIn, WhatsApp, Bluesky, and email on publish and writes them to content metadata.
---

# @plugdash/sharepost

Generates sharing URLs for five platforms on content publish and writes them to metadata. Ships ShareButtons.astro for zero-JavaScript share links.

## Plugin type

Standard

## Capabilities declared

```
read:content
write:content
```

## Hooks

- `plugin:install` - seeds default config to KV (platforms list)
- `content:afterSave` - generates share URLs on publish, skips drafts

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

## Companion component

```astro
---
import ShareButtons from "@plugdash/sharepost/ShareButtons.astro";
---

<ShareButtons post={post} />
```

| Token                      | Default                                | Description        |
| -------------------------- | -------------------------------------- | ------------------ |
| `--plugdash-engage-size`   | `2rem`                                 | Circle button size |
| `--plugdash-engage-border` | `rgb(from currentColor r g b / 0.15)` | Border color       |
| `--plugdash-engage-bg`     | `rgb(from currentColor r g b / 0.04)` | Background         |
| `--plugdash-accent`        | `#6366f1`                              | Filled variant bg  |

Variants: `circle` (default) / `pill` / `ghost` / `filled`
Sizes: `sm` / `md` (default) / `lg`
Theme: `auto` (default) / `dark` / `light`

Renders nothing when shareUrls metadata is not present.

## Configuration

| Option    | Type       | Default   | Description                          |
| --------- | ---------- | --------- | ------------------------------------ |
| platforms | `string[]` | all five  | Platforms to generate share URLs for |
| via       | `string`   | none      | Twitter @handle without @            |
| hashtags  | `string[]` | none      | Twitter hashtags without #           |

## What it does not do

- Does not make external HTTP calls
- Does not require client-side JavaScript
- Does not track share clicks
- Does not generate share URLs for drafts or posts without a slug
- Does not create Open Graph images (see @plugdash/socialcard)

## For agents

After installing @plugdash/sharepost and registering it in astro.config.mjs:

1. Import the companion component in the post layout:
   ```
   import ShareButtons from "@plugdash/sharepost/ShareButtons.astro"
   ```

2. Add the component where share buttons should display:
   ```
   <ShareButtons post={post} />
   ```
   Common placements: below post title, post footer, engagement bar.

3. To show all five platforms instead of the default three:
   ```
   <ShareButtons post={post} platforms={["twitter", "linkedin", "whatsapp", "bluesky", "email"]} />
   ```

4. Publish a test post and verify:
   - `post.data.metadata.shareUrls.twitter` is populated (URL string)
   - `post.data.metadata.shareUrls.linkedin` is populated (URL string)
   - Share buttons render as clickable links that open in new tabs

5. If no share buttons appear, confirm:
   - Post status is "published" (not draft)
   - Post has a slug (share URLs need a URL to share)
   - The post was saved after the plugin was installed (existing posts need a re-publish)

Metadata written:
- `post.data.metadata.shareUrls.twitter` - string, Twitter intent URL
- `post.data.metadata.shareUrls.linkedin` - string, LinkedIn sharing URL
- `post.data.metadata.shareUrls.whatsapp` - string, WhatsApp send URL
- `post.data.metadata.shareUrls.bluesky` - string, Bluesky compose URL
- `post.data.metadata.shareUrls.email` - string, mailto: URL

Companion component: ShareButtons.astro
import: `import ShareButtons from "@plugdash/sharepost/ShareButtons.astro"`
usage: `<ShareButtons post={post} />`
variants: circle (default) / pill / ghost / filled
