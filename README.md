# PlugDash

Plugin catalog for [EmDash](https://emdashcms.com). MIT licensed.

Each plugin does one thing, ships a companion Astro component that works with no configuration, and publishes to npm under `@plugdash/`.

## Plugins

| Package                                           | What it does                                                       | Status                                   |
| ------------------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------- |
| [@plugdash/readtime](./packages/readtime)         | Word count and reading time for posts                              | Being reworked to compute at render time |
| [@plugdash/callout](./packages/callout)           | Info, warning, tip, and danger callout blocks in the editor        | Published                                |
| [@plugdash/codeblock](./packages/codeblock)       | Shiki syntax highlighting for code blocks, with a copy button      | Published                                |
| [@plugdash/tocgen](./packages/tocgen)             | Nested table of contents from Portable Text headings               | Being reworked to compute at render time |
| [@plugdash/shortlink](./packages/shortlink)       | Short URLs for posts, stored as native EmDash redirects            | Being reworked                           |
| [@plugdash/sharepost](./packages/sharepost)       | Share button URLs for Twitter, LinkedIn, WhatsApp, Bluesky, email  | Being reworked to compute at render time |
| [@plugdash/heartpost](./packages/heartpost)       | Heart button with a per-post count in plugin KV                    | Being reworked                           |
| [@plugdash/engage](./packages/engage)             | Heart, share, and copy-link composed into one component            | Follows heartpost, sharepost, shortlink  |
| [@plugdash/autobuild](./packages/autobuild)       | Fires a Cloudflare Pages, Netlify, or Vercel build hook on publish | Being reworked to fire on publish only   |
| [@plugdash/socialcard](./packages/socialcard)     | OG social card image generated on publish                          | Being reworked                           |
| [@plugdash/enrichkit](./packages/enrichkit)       | AI summary, topics, tags, and tweet draft for published posts      | Being reworked                           |
| [@plugdash/fromghost](./packages/fromghost)       | Import a Ghost JSON export                                         | Being reworked                           |
| [@plugdash/fromsubstack](./packages/fromsubstack) | Import a Substack export                                           | Being reworked                           |

"Being reworked" means the package passes its unit tests but did not do its job on a real EmDash blog-template site in testing on 2026-09-27. The shared pattern for plugins with hooks is in [docs/plugin-pattern.md](./docs/plugin-pattern.md).

## Install

```bash
pnpm add @plugdash/heartpost
```

Register in your EmDash config:

```js
// astro.config.mjs
import emdash from "emdash/astro";
import { heartpostPlugin } from "@plugdash/heartpost";

export default defineConfig({
	integrations: [
		emdash({
			plugins: [heartpostPlugin()],
		}),
	],
});
```

Import the companion component where you want it to render:

```astro
---
import HeartButton from "@plugdash/heartpost/HeartButton.astro";
---
<HeartButton post={post} />
```

Render-time plugins (readtime, tocgen, sharepost) need no registration: import the component and pass `post`. Each plugin's README covers its own config options and component variants.

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

### End-to-end tests against real EmDash

```bash
pnpm exec playwright install chromium   # once
pnpm e2e        # build a real EmDash blog with every plugin, run all e2e specs on astro dev
pnpm e2e:prod   # same site, production build, only specs tagged @prod
```

`pnpm e2e:setup` (run by both) clones the pinned EmDash blog template into `.real-emdash/site`, packs every package into a tarball, installs them and registers every plugin with no options. It takes a couple of minutes the first time. Set `E2E_PORT` / `E2E_PROD_PORT` if 4321 / 4400 are taken. The `Real EmDash` workflow runs both modes on every PR. See [e2e/harness/README.md](./e2e/harness/README.md) for writing specs.

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

Read [AGENTS.md](./AGENTS.md) before adding a new plugin. It covers the two-file plugin structure, the stage system, the design rules, and EmDash behavior confirmed on a real site. Plugins must pass `pnpm e2e` and `pnpm e2e:prod` on the blog template.
