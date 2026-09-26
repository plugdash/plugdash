---
name: fromghost
description: Ghost JSON export importer. Native plugin registering an ImportSource so posts, pages, tags and authors from a Ghost export show up in EmDash's own import screen.
---

# @plugdash/fromghost

## what it does

Parses a Ghost JSON export (Settings > Labs > Export your content) and
registers it as a source in EmDash's `ImportSource` registry, next to the
built-in WordPress/WXR importers. Converts post bodies to Portable Text via
the shared `@plugdash/html-to-portable-text` converter.

## plugin type

Native

## capabilities declared

```
content:write
media:write
```

Note: Spec 12 originally named `write:content`, `write:media`, `read:schema`.
The real `PluginCapability` union in `@plugdash/types` uses `content:write` /
`media:write` (those older forms are deprecated aliases), and `read:schema`
does not exist in the union at all, so it was dropped.

## hooks

None. Pure `ImportSource` registration - no `definePlugin` hooks are used for
the actual work, only to satisfy the plugin descriptor shape.

## install

```bash
pnpm add @plugdash/fromghost
```

## register

```js
// astro.config.mjs
import { defineConfig } from "astro/config";
import emdash from "emdash";
import { fromghostPlugin } from "@plugdash/fromghost";

export default defineConfig({
  integrations: [
    emdash({
      plugins: [fromghostPlugin()], // must be plugins, not sandboxed - needs Node fs/JSON
    }),
  ],
});
```

`fromghostPlugin(config)` calls `registerSource()` as a side effect and
returns the plugin descriptor. Importing the package at all also
self-registers a zero-config default source, mirroring how EmDash's own
built-in WXR/WordPress sources work - but `fromghostPlugin()` is the way to
pass `siteUrl`, `preserveSlugs`, etc.

## configuration

| Option              | Type       | Default   | Description                                     |
| -------------------- | ---------- | --------- | ------------------------------------------------ |
| `targetCollection`  | `string`   | `"posts"` | Collection suggested for Ghost posts             |
| `preserveSlugs`     | `boolean`  | `true`    | Keep Ghost's slugs instead of regenerating        |
| `importImages`      | `boolean`  | `true`    | Carry feature and inline images over              |
| `importTags`        | `boolean`  | `true`    | Carry Ghost tags over as taxonomy terms           |
| `siteUrl`           | `string`   | `""`      | Ghost site URL, to resolve `__GHOST_URL__` paths |
| `onWarn`            | `(message: string) => void` | discard | Called for each recoverable import problem |

## what it does not do

- No Mobiledoc conversion (Ghost 3 and older editor format) - imports with
  an empty body and a warning
- No media download/upload - `featuredImage` is a URL handed to EmDash's own
  import pipeline
- No members, newsletters, or comments import
- No preservation of Ghost's internal (`visibility: "internal"`) tags
- Cannot be sandboxed - needs Node JSON parsing and registers directly into
  EmDash's import-source registry

## for agents

After installing @plugdash/fromghost and registering it in astro.config.mjs:

1. No additional UI setup needed - "Ghost Export File" appears automatically
   as a source in EmDash's admin import screen (`/_emdash/admin/import`).

2. To verify setup, export a Ghost site as JSON (Settings > Labs > Export),
   upload it on the import screen, confirm the analysis shows the expected
   post/page/tag counts, then run the import and check the created content.

3. If feature images don't resolve, confirm `siteUrl` is set in
   `fromghostPlugin({ siteUrl: "https://yoursite.com" })` - without it,
   Ghost's `__GHOST_URL__`-relative image paths are skipped, not guessed at.

4. If a post's body is empty after import, check `onWarn` output for a
   Mobiledoc or Lexical warning - Mobiledoc posts have no converter and
   Lexical drafts without rendered HTML are recovered as plain text only.

Metadata written: none (import source only, no persistent plugin state)
Source id: `ghost`
Exports: `fromghostPlugin`, `createGhostSource`, `ghostSource`, plus the
`ghost-export.ts` parsing helpers (`parseGhostExport`, `mapGhostStatus`, etc.)
