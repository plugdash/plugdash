---
name: shortlink
description: Short URL plugin for EmDash. On publish it creates a native EmDash 301 redirect from /s/<code> to the entry, where code is the last 8 chars of the entry id.
---

# @plugdash/shortlink

## What it does

When an entry is published, the plugin creates a native EmDash redirect `/s/<code>` that points at the entry with a 301. The code is the last 8 characters of the entry id, lowercased, so CopyLink can build the short URL without any lookup.

## Plugin type

Native

## Capabilities declared

```ts
capabilities: ["content:read", "schema:read", "redirects:write"];
```

## Hooks

- `content:afterPublish`: if the redirect doesn't exist yet, it creates `{ source: "/s/<code>", destination, type: 301, groupName: "shortlink" }`. If it exists for the same entry and the destination has changed, it updates it. If the source belongs to a different entry or was added by hand, it logs the collision and leaves the redirect alone. It also migrates a 0.2.x code stored under KV `shortlink:by-content:<id>`. It never throws.

## Install

```bash
pnpm add @plugdash/shortlink
```

## Register

```js
import emdash from "emdash/astro";
import { shortlinkPlugin } from "@plugdash/shortlink";

emdash({ plugins: [shortlinkPlugin()] });
```

## Companion component

```astro
---
import CopyLink from "@plugdash/shortlink/CopyLink.astro";
---

<CopyLink post={post} />
```

| Token                           | Default                               | Description        |
| ------------------------------- | ------------------------------------- | ------------------ |
| `--plugdash-engage-size`        | `2rem`                                | Circle button size |
| `--plugdash-engage-border`      | `rgb(from currentColor r g b / 0.15)` | Border color       |
| `--plugdash-engage-bg`          | `rgb(from currentColor r g b / 0.04)` | Background         |
| `--plugdash-copy-success-color` | `#22c55e`                             | Check icon color   |

Variants: `circle` (default) / `pill` / `ghost` / `inline`
Sizes: `sm` / `md` (default) / `lg`
Theme: `auto` (default) / `dark` / `light`
Props: `prefix` (default `"/s/"`, must match the plugin option) and `showUrl`.

It renders nothing when `post.data.id` is missing.

## Configuration

| Option        | Type     | Default                  | Description                                        |
| ------------- | -------- | ------------------------ | -------------------------------------------------- |
| `prefix`      | `string` | `"/s/"`                  | Short link path prefix                             |
| `pathPattern` | `string` | `"/{collection}/{slug}"` | Destination when the collection has no URL pattern |

## What it does not do

- No custom route or page. The redirect is served by EmDash.
- No metadata is written to the entry.
- No custom or vanity codes, and no cleanup when an entry is unpublished.

## For agents

After installing @plugdash/shortlink and registering it in astro.config.mjs:

1. If the site has `src/pages/s/[code].astro` from 0.2.x, delete it.
2. Import the component in the post layout:
   import CopyLink from "@plugdash/shortlink/CopyLink.astro"
3. Render it: `<CopyLink post={post} />`. If the plugin has a custom `prefix`, pass the same `prefix` prop.
4. Publish a test post and verify:
   `curl -I <site>/s/<last 8 chars of the entry id, lowercased>` returns `301` with `location` set to the post path.
   The redirect shows up in admin **Redirects** under group `shortlink`.
5. If there's no redirect: make sure the post was published (not just saved), and that the collection is routable or `pathPattern` fits. Then look in the server log for `[plugin:shortlink]` lines. A "collision" line means that source path already exists.

Metadata written: none.
Records written: one EmDash redirect per published entry (group `shortlink`).
Code helper: `import { shortCode } from "@plugdash/shortlink"`.
Companion component: CopyLink.astro
import: import CopyLink from "@plugdash/shortlink/CopyLink.astro"
usage: <CopyLink post={post} />
