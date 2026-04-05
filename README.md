# PlugDash

Plugin catalog for [EmDash](https://emdashcms.com). MIT licensed.

Each plugin does one thing, ships a companion Astro component that works with no configuration, and publishes to npm under `@plugdash/`.

## Plugins

| Package | What it does |
| --- | --- |
| [@plugdash/readtime](./packages/readtime) | Word count and reading time, written to post metadata on publish |
| [@plugdash/callout](./packages/callout) | Info, warning, tip, and danger callout blocks in the editor |
| [@plugdash/tocgen](./packages/tocgen) | Nested table of contents from Portable Text headings |
| [@plugdash/shortlink](./packages/shortlink) | Short URLs for posts, with resolver route and admin page |
| [@plugdash/sharepost](./packages/sharepost) | Share button URLs for Twitter, LinkedIn, WhatsApp, Bluesky, email |
| [@plugdash/heartpost](./packages/heartpost) | Heart button with KV-backed per-post counter and fingerprint dedup |
| [@plugdash/engage](./packages/engage) | Heart, share, and copy-link composed into one component |

## Install

```bash
pnpm add @plugdash/readtime
```

Register in your EmDash config:

```js
// astro.config.mjs
import { readtimePlugin } from "@plugdash/readtime";

export default defineConfig({
  integrations: [
    emdash({
      plugins: [readtimePlugin()],
    }),
  ],
});
```

Import the companion component where you want it to render:

```astro
---
import ReadingTime from "@plugdash/readtime/ReadingTime.astro";
---
<ReadingTime post={post} />
```

Each plugin's README covers its own config options and component variants.

## Development

```bash
pnpm install
pnpm build      # build all packages with tsdown
pnpm test       # run vitest across all packages
pnpm typecheck  # tsc --noEmit in every package
pnpm lint       # oxlint
pnpm smoke      # verify each built package exports a valid descriptor
```

The full smoke gate (`lint -> build -> typecheck -> test -> smoke`) runs on every push via GitHub Actions. Nothing publishes to npm unless all five pass.

## Releasing

Versioning and publishing use [changesets](https://github.com/changesets/changesets).

```bash
# describe your change
pnpm changeset

# commit and push
git add -A && git commit -m "feat(readtime): ..."
git push
```

A "Version Packages" PR opens automatically on main. Merging it bumps versions, updates changelogs, and publishes to npm.

## Contributing

Read [AGENTS.md](./AGENTS.md) before adding a new plugin. It covers the two-file plugin structure, the stage system, and confirmed EmDash API behavior learned while building these plugins.
