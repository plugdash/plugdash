# @plugdash/shortlink

Every post deserves a short URL, and most setups hand that to an outside service.
On publish, this plugin adds one native EmDash redirect per entry (`/s/<code>` to the post, 301). There's no custom route, no page to add, and no metadata to read.
Ships `CopyLink.astro`, a copy-to-clipboard button that builds the short URL from the entry id.
The EmDash equivalent of [Pretty Links](https://wordpress.org/plugins/pretty-link/) (basic tier).

## Install

```bash
pnpm add @plugdash/shortlink
```

## Register

```js
// astro.config.mjs
import { defineConfig } from "astro/config";
import emdash from "emdash/astro";
import { shortlinkPlugin } from "@plugdash/shortlink";

export default defineConfig({
	integrations: [
		emdash({
			plugins: [shortlinkPlugin()],
		}),
	],
});
```

That's it. Publish a post and `/s/<code>` answers with a 301 in one request, in dev and in production.

## How it works

- The code is the last 8 characters of the entry id, lowercased: `01J9ZQ3V8R5K7M2N4P6Q8S0T1W` gives `6q8s0t1w`. You can get it from `shortCode(id)`, which the package root exports.
- On `content:afterPublish` the plugin checks whether the redirect already exists. If not, it creates `{ source: "/s/<code>", destination, type: 301, groupName: "shortlink" }`.
- The destination is the entry's public path, based on the collection's URL pattern. If the collection has no URL pattern, the `pathPattern` option is used instead. Only the path is stored, never the site origin, so a stale site URL can't leak into links.
- Republishing does nothing when the destination hasn't changed. If it has changed, for example because the URL pattern changed, the plugin updates the redirect.
- When a slug changes, EmDash adds its own "slug change" redirect and rewrites any redirect that pointed at the old URL. The short link moves to the new URL in one hop, with no help from the plugin.
- Collisions: if `/s/<code>` already exists and belongs to a different entry or was added by hand, the plugin leaves it alone. It logs both entry ids at error level.
- Hits, the last-hit time and 404 tracking all come from EmDash's redirect engine.

## Managing short links

Open **Redirects** in the EmDash admin and filter by group `shortlink`. From there you can see hits, edit destinations, or turn a short link off.

To stop a short link working, **disable** it instead of deleting it. A deleted short link comes back the next time its entry is published.

## Companion component

```astro
---
import CopyLink from "@plugdash/shortlink/CopyLink.astro";
---

<CopyLink post={post} />
```

`post` is the entry from `getEmDashEntry` / `getEmDashCollection`. The component reads `post.data.id` and makes no database call. The absolute URL uses `Astro.site` when it's set, and falls back to the request origin.

| Prop      | Type                                        | Default    | Description                         |
| --------- | ------------------------------------------- | ---------- | ----------------------------------- |
| `post`    | `object`                                    | required   | Entry with `data.id`                |
| `prefix`  | `string`                                    | `"/s/"`    | Must match the plugin's `prefix`    |
| `showUrl` | `boolean`                                   | `false`    | Show the short URL next to the icon |
| `variant` | `"circle" \| "pill" \| "ghost" \| "inline"` | `"circle"` | Visual style                        |
| `size`    | `"sm" \| "md" \| "lg"`                      | `"md"`     | Button size                         |
| `theme`   | `"auto" \| "dark" \| "light"`               | `"auto"`   | Colour scheme                       |
| `class`   | `string`                                    | -          | Extra CSS class                     |

It renders nothing when the entry has no id.

| Token                           | Default                               |
| ------------------------------- | ------------------------------------- |
| `--plugdash-engage-size`        | `2rem`                                |
| `--plugdash-engage-border`      | `rgb(from currentColor r g b / 0.15)` |
| `--plugdash-engage-bg`          | `rgb(from currentColor r g b / 0.04)` |
| `--plugdash-copy-success-color` | `#22c55e`                             |

## Configuration

```js
shortlinkPlugin({ prefix: "/go/", pathPattern: "/{collection}/{slug}" });
```

| Option        | Type     | Default                  | Description                                                                                     |
| ------------- | -------- | ------------------------ | ----------------------------------------------------------------------------------------------- |
| `prefix`      | `string` | `"/s/"`                  | Path prefix for short links. Pass the same value to `CopyLink`.                                 |
| `pathPattern` | `string` | `"/{collection}/{slug}"` | Destination when a collection has no URL pattern. Supports `{collection}`, `{slug}` and `{id}`. |

If you change `prefix`, also pass it to `<CopyLink prefix="/go/" />`. Otherwise the button copies links that 404.

## Capabilities

`content:read`, `schema:read` (to read the collection's URL pattern) and `redirects:write`.

## Upgrading from 0.2.x

- Delete `src/pages/s/[code].astro`, along with any page that rendered `RedirectPage.astro`. EmDash's redirect engine handles `/s/<code>` now, so the page is no longer needed.
- Remove `autoCreate` and any other old options from `shortlinkPlugin()`. The `@plugdash/shortlink/sandbox` and `RedirectPage.astro` exports are gone.
- Old codes keep working. On an entry's next publish, if 0.2.x stored a code for it, the plugin adds a redirect for that old code as well.
- Codes that were created by hand in the old admin table are not migrated. Add them in **Redirects** if you still need them.
- See CHANGELOG.md for the full list.

## What it does not do

- Custom or vanity codes. Add those as regular redirects in the admin.
- Remove a redirect when its entry is unpublished or deleted. Disable it in **Redirects**.
- Click analytics beyond EmDash's hit count and last-hit time.

## License

MIT
