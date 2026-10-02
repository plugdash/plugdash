---
name: sharepost
description: Share buttons for EmDash. Builds share links for Twitter/X, LinkedIn, WhatsApp, Bluesky, and email at render time.
---

# @plugdash/sharepost

Builds sharing links for five platforms at render time. Ships ShareButtons.astro for zero-JavaScript share links.

## Plugin type

Native (deprecated no-op descriptor, nothing to register)

## Capabilities declared

None.

## Hooks

None.

## Install

```bash
pnpm add @plugdash/sharepost
```

## Register

Not needed. Set `site` in `astro.config.mjs` so links use your public domain.

## Companion component

```astro
---
import ShareButtons from "@plugdash/sharepost/ShareButtons.astro";
---

<ShareButtons post={post} />
```

| Token                      | Default                               | Description        |
| -------------------------- | ------------------------------------- | ------------------ |
| `--plugdash-engage-size`   | `2rem`                                | Circle button size |
| `--plugdash-engage-border` | `rgb(from currentColor r g b / 0.15)` | Border color       |
| `--plugdash-engage-bg`     | `rgb(from currentColor r g b / 0.04)` | Background         |
| `--plugdash-accent`        | `#6366f1`                             | Filled variant bg  |

Variants: `circle` (default) / `pill` / `ghost` / `filled`
Sizes: `sm` / `md` (default) / `lg`
Theme: `auto` (default) / `dark` / `light`

## Platform hover colours

Buttons tint to their brand colour on hover by default (X `#1d9bf0`,
LinkedIn `#0a66c2`, Bluesky `#0085ff`, WhatsApp `#25d366`, Email uses
`--plugdash-accent`). Override via CSS custom properties:

```css
:root {
	--plugdash-share-twitter-color: #000000;
	--plugdash-share-linkedin-color: #004182;
	--plugdash-share-bluesky-color: #0085ff;
	--plugdash-share-whatsapp-color: #25d366;
	--plugdash-share-email-color: #6366f1;
}
```

## Configuration

Props on `<ShareButtons>`:

| Prop      | Type       | Default                    | Description                        |
| --------- | ---------- | -------------------------- | ---------------------------------- |
| url       | `string`   | current page, absolute     | URL to share                       |
| title     | `string`   | `post.data.title`          | Share text                         |
| platforms | `string[]` | twitter, linkedin, bluesky | Which buttons to show              |
| via       | `string`   | none                       | X handle without @ (X link only)   |
| hashtags  | `string[]` | none                       | X hashtags without # (X link only) |

## What it does not do

- Does not make external HTTP calls
- Does not require client-side JavaScript
- Does not track share clicks
- Does not write metadata or register hooks
- Does not create Open Graph images (see @plugdash/socialcard)

## For agents

After installing @plugdash/sharepost (no registration needed):

1. Import the companion component in the post layout:

   ```
   import ShareButtons from "@plugdash/sharepost/ShareButtons.astro"
   ```

2. Add it on the post page:

   ```
   <ShareButtons post={post} via="yourhandle" platforms={["twitter", "linkedin", "whatsapp", "bluesky", "email"]} />
   ```

3. Set `site: "https://your-domain"` in astro.config.mjs so the links use the public domain.

4. Verify: load a published post and check the X link contains `url=` with an absolute URL (`https%3A%2F%2F...`) and `via=yourhandle`.

5. If the URL is wrong behind a proxy, set `site` or pass `url`.

Metadata written: none.
Companion component: ShareButtons.astro
import: `import ShareButtons from "@plugdash/sharepost/ShareButtons.astro"`
usage: `<ShareButtons post={post} />`
variants: circle (default) / pill / ghost / filled
