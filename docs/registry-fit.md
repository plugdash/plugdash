# Registry fit: which plugdash plugins can be sandboxed (EmDash 1.0 registry)

Spike for card #26. Checked 2026-10-02 against `emdash@1.0.1`, `@emdash-cms/sandbox-workerd@0.9.2` with `workerd@1.20261001.1` (Node), `@emdash-cms/plugin-cli@0.13.2`. Nothing was published to the real registry.

## Short answer

- **2 of 13** packages can go in the registry as they are: `autobuild` and `enrichkit` (reduced, no seo write). **2 more are splits** (`heartpost`, `shortlink`): a registry server part plus an npm component.
- **9 stay native only.** The registry bundle holds one JS file plus a manifest. It cannot carry an Astro component, a Portable Text block renderer, or a `registerSource` importer.
- The three render-time plugins (`readtime`, `tocgen`, `sharepost`) have nothing to run on the server at all. They are npm component packages. Putting an empty plugin in the registry would only make an install that does nothing.
- Biggest surprise: on 1.0.1 a sandboxed plugin **cannot write `seo`** through `ctx.content.update`. Tested, see "Proof". That blocks `socialcard` and the `seo.description` write in `enrichkit`.

## What the registry accepts

| Fact                                                                                                                                                                                                    | Source                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Registry plugins are always sandboxed. The site runs them through its sandbox runner with only the access they asked for.                                                                               | registry-cli release notes, https://emdashcms.com/blog/emdash-plugin-registry           |
| Bundle = `manifest.json` + `backend.js` (+ optional README, icon, screenshots). Limits: 256 KB decompressed total, 128 KB per file, 20 files, no Node built-ins.                                        | plugin-cli `bundle` docs                                                                |
| Manifest `admin` can hold `pages`, `widgets`, `settingsSchema`, `fieldWidgets`, `editorPanels`, `editorActions`. **No `portableTextBlocks`, no component entry.**                                       | `node_modules/@emdash-cms/plugin-cli/schemas/emdash-plugin.schema.json`, `admin`        |
| `network:request` needs a non-empty `allowedHosts` list in the manifest (max 64) unless `network:request:unrestricted` is declared. Hosts are fixed per release.                                        | same schema, `allowedHosts`                                                             |
| Changing capabilities or hosts between releases needs a major version bump.                                                                                                                             | publishing docs                                                                         |
| `release.requires` can pin `env:emdash` and `env:astro` semver ranges. The host refuses to install if they do not match.                                                                                | schema, `release.requires`                                                              |
| On Node the sandbox is `@emdash-cms/sandbox-workerd` (needs `workerd`). It enforces only a wall-clock timeout, no CPU or memory limit. On Cloudflare Workers it needs the paid plan with Worker Loader. | `runner-*.mjs` header comment, https://docs.emdashcms.com/plugins/installing/           |
| `plugin:install` fires for registry installs (it never fires for plugins in `astro.config`). Seeding KV from it works here.                                                                             | `emdash-runtime.ts:1088`, `routes/api/admin/plugins/registry/install.ts:122` (from #25) |
| Plugin options from `astro.config` do not reach sandboxed plugins. Config comes from `admin.settingsSchema` (`ctx.settings`) and the admin page.                                                        | #00 fact 5, #01 rule 2                                                                  |

Sandbox bridge calls available on Node (`runner-*.mjs`, `case "x/y"` list): `kv`, `settings`, `content` (get, list, create, update, delete, publish...), `schema` (listCollections, getCollection), `media` (upload, get, list, delete), `redirect` (list, get, create, update, delete), `storage` (put, get, query, compareAndSet...), `cron`, `email`, `http`, `taxonomy`, `users`, `comments`, `bylines`. `requestMeta` is passed through to route handlers.

## How the target design was chosen

Open PRs are rewriting several plugins, so I judged each one by its **target design in `cards/NN.md`**, not by current main. Used per row:

- readtime: card #06 (PR #36). tocgen: card #07 (PR #41). sharepost: card #08 (PR #39). All three become render-time with a no-op native descriptor.
- heartpost: card #09 (PR #34). shortlink: card #10. autobuild: card #12. socialcard: card #13. enrichkit: card #14. codeblock: card #15.
- callout, engage, fromghost, fromsubstack: current main plus cards #16, #11, #17, #18 (they do not change the answer).

If a card changes shape before it merges, only the row for that plugin needs a second look.

## Table

Capabilities are the smallest set the target design needs. "Component" means an `.astro` file that must ship on npm.

| #   | Package      | Target design used                                                                | Capabilities needed                                                             | Blocker for sandbox                                                                                                                                                                                                                                                           | Verdict                                        |
| --- | ------------ | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| 1   | readtime     | #06: pure function in the component, no hooks                                     | none                                                                            | Nothing runs on the server. It is only an Astro component.                                                                                                                                                                                                                    | NATIVE ONLY (npm component package, no plugin) |
| 2   | tocgen       | #07: render-time TOC plus heading-id helper                                       | none                                                                            | Same as readtime.                                                                                                                                                                                                                                                             | NATIVE ONLY (npm component package, no plugin) |
| 3   | sharepost    | #08: render-time share URLs                                                       | none                                                                            | Same as readtime.                                                                                                                                                                                                                                                             | NATIVE ONLY (npm component package, no plugin) |
| 4   | heartpost    | #09: public routes, KV count, `ctx.storage` rate-limit table                      | `content:read`                                                                  | The button is an Astro component. The server part (routes, `kv.compareAndSet`, `storage`) all exist in the sandbox bridge. Options (`rateLimitPerMinute`, `trustProxyHeader`) must move to `settingsSchema`.                                                                  | SPLIT                                          |
| 5   | shortlink    | #10: `afterPublish` creates a native redirect                                     | `content:read`, `redirects:write`, `schema:read` (only if reading `urlPattern`) | `CopyLink.astro` must stay on npm. `redirect/*` and `schema/*` exist in the bridge. The `prefix` option moves to a setting and must match the component prop. `shortCode()` is needed in both the sandbox entry and the component, so it is bundled twice.                    | SPLIT                                          |
| 6   | autobuild    | #12: `afterPublish`, `afterUnpublish`, `afterDelete`, KV debounce                 | `content:read`, `network:request` (+ `allowedHosts`)                            | None for the three default hosts. A hook URL on any other host is blocked unless the plugin declares `network:request:unrestricted`, which is a worse consent prompt. Hook URL must come from a secret setting, not an option.                                                | REGISTRY                                       |
| 7   | socialcard   | #13: PNG via `@resvg/resvg-wasm`, upload to media, write `seo.image`              | `content:read`, `content:write`, `media:write`                                  | (a) `seo` cannot be written from a sandbox on 1.0.1 (tested). (b) resvg WASM plus a font is well over the 128 KB per file / 256 KB total bundle limit (WASM is a few MB, not measured here). (c) Node sandbox has no CPU cap, Workers sandbox does: PNG render may exceed it. | NATIVE ONLY                                    |
| 8   | enrichkit    | #14: `afterPublish`, hash skip, structured LLM call, KV result, `seo.description` | `content:read`, `network:request` (+ `api.anthropic.com`, `api.openai.com`)     | `seo.description` write is not possible from a sandbox (tested). Without it the plugin still stores results in KV and shows them in the admin page. API key via `settingsSchema` secret works. Drop `content:write` from the manifest if `seo` is skipped.                    | REGISTRY (reduced: no `writeSeoDescription`)   |
| 9   | codeblock    | #15: Shiki highlight in `beforeSave`, native block renderer                       | `content:write` (`beforeSave`)                                                  | Block renderer is an Astro component (`componentsEntry`). `portableTextBlocks` is not in the registry manifest. Shiki grammars and WASM blow the 128 KB file limit.                                                                                                           | NATIVE ONLY                                    |
| 10  | callout      | main (#16 only touches the editor and component)                                  | none                                                                            | Portable Text block type with an Astro renderer, same blockers as codeblock.                                                                                                                                                                                                  | NATIVE ONLY                                    |
| 11  | engage       | main + #11: `EngagementBar.astro` only                                            | none                                                                            | No plugin at all, only a component that composes the other three.                                                                                                                                                                                                             | NATIVE ONLY (npm component package)            |
| 12  | fromghost    | main + #17: `registerSource()` importer, linkedom                                 | `content:write`, `media:write`                                                  | `registerSource` is an `emdash` runtime import with no sandbox equivalent. Needs Node (linkedom, file parsing). There is also no admin UI for sources (#00 fact 15), so a registry install could not even start an import.                                                    | NATIVE ONLY                                    |
| 13  | fromsubstack | main + #18: `registerSource()` importer, zip and CSV                              | `content:write`, `media:write`                                                  | Same as fromghost, plus zip handling.                                                                                                                                                                                                                                         | NATIVE ONLY                                    |

Counts: REGISTRY 2 (autobuild, enrichkit), SPLIT 2 (heartpost, shortlink), NATIVE ONLY 9.

### Notes on the SPLIT rows

- The registry install and the npm component are two separate installs. Nothing links them. The README of each must say "install both" and the component must render something harmless (or nothing) if the server part is missing.
- For a SPLIT plugin, one source tree produces two outputs: `emdash-plugin build` makes `dist/plugin.mjs` (sandbox entry) and `emdash-plugin.jsonc` describes the manifest; the `.astro` file ships from `src/` on npm as today. The sandbox entry must not import local files that the build cannot inline (the existing AGENTS.md rule about `generateSandboxedPluginsModule` is about the config-declared path, the registry bundler uses tsdown and inlines).
- A native `createPlugin(options)` plugin cannot be converted by renaming. The option bridge is different (settings instead of options), and a native descriptor in `sandboxed: []` is rejected at config load (#01 k).

### Notes on discoverability

The registry is where new users look first (card #26 "Why"), but 9 of 13 packages and all the visible UI cannot be in it. Practical options, cheapest first:

1. Publish autobuild and enrichkit as they are (small).
2. Publish the server part of heartpost and shortlink only when their component package is stable, and document the two-step install on the registry listing (`description`, README in the bundle).
3. Skip listings for render-time plugins. An empty plugin only adds a step.
4. Ask upstream whether the registry can list an npm-component-only entry (not a CLI feature today) and whether sandbox `content.update` will accept `seo` (see below).

## Proof: smallest sandboxed plugin, run on the test site

Plugin: `pd-proof`, scaffolded with the official CLI, one `content:afterPublish` hook, one public route, capabilities `content:read` and `content:write`. Source (final version):

```ts
import type { SandboxedPlugin } from "emdash/plugin";

const plugin: SandboxedPlugin = {
	hooks: {
		"content:afterPublish": {
			handler: async (event, ctx) => {
				ctx.log.info("proof afterPublish", {
					collection: event.collection,
					id: event.content.id,
				});
				try {
					await ctx.content!.update(event.collection, event.content.id as string, {
						seo: { description: "set by pd-proof" },
					});
					ctx.log.info("proof seo update ok");
				} catch (err) {
					ctx.log.error("proof seo update failed", { err: String(err) });
				}
			},
		},
	},
	routes: {
		hello: {
			public: true,
			handler: async (_routeCtx, ctx) => ({ greeting: "hello", pluginId: ctx.plugin.id }),
		},
	},
};

export default plugin;
```

### Steps

```bash
# 1. scaffold (a DID is required when the handle cannot be resolved, so a placeholder works offline)
npx -y @emdash-cms/plugin-cli@0.13.2 init pd-proof \
  --publisher did:plc:ewvi7nxzyoun6zhxrhs64oiz --author-name PlugDash \
  --security-email security@example.com --package-manager pnpm -y
cd pd-proof
# edit emdash-plugin.jsonc: "capabilities": ["content:read", "content:write"]
# edit package.json: devDependency "emdash": "^1.0.1" (scaffold pins <1.0.0)
pnpm install
pnpm run validate        # Manifest is valid
pnpm run build           # writes dist/index.mjs (descriptor), dist/plugin.mjs, dist/manifest.json
pnpm run bundle          # Created pd-proof-0.1.0.tar.gz (1.2KB), Bundle size: 1.9 KB across 3 files

# 2. install on the test site (copy of the blog template, emdash 1.0.1)
cd site-26
pnpm add ../pd-proof @emdash-cms/sandbox-workerd workerd
```

`astro.config.mjs`:

```js
import pdProof from "pd-proof";
// ...
emdash({
	sandboxed: [pdProof],
	sandboxRunner: "@emdash-cms/sandbox-workerd/sandbox", // a module string, not a function call
	database: sqlite({ url: "file:./data.db" }),
	storage: local({ directory: "./uploads", baseUrl: "/_emdash/api/media/file" }),
});
```

`pnpm dev --host 127.0.0.1 --port 5152`, then dev-bypass session, then:

### Logs

Startup (`.astro/dev.log`):

```
EmDash: Loaded sandboxed plugin pd-proof:0.1.0 with capabilities: [content:read]
```

Public route through the sandbox:

```
GET /_emdash/api/plugins/pd-proof/hello
{"success":true,"data":{"greeting":"hello","pluginId":"pd-proof"}}
```

Admin plugin list (`/_emdash/api/admin/plugins`): `pd-proof True None ['content:read']` (enabled, capabilities listed, no `format` field returned).

Publish of a post (`POST /_emdash/api/content/posts/<id>/publish`):

```
[plugin:pd-proof] proof afterPublish { collection: 'posts', id: '01M3XCFJ6MTR267PFP8DHT29YG' }
```

SEO write attempt from the sandbox (second run, with `content:write`):

```
[plugin:pd-proof] proof seo update failed {
  err: `Error: Bridge call content/update failed: {"error":"Unknown field 'seo' in collection 'posts'"}`
}
```

### What the proof shows

- A standard-format plugin built by the official CLI loads in the Node sandbox, its hook runs after publish, its public route answers, `ctx.log` adds the `[plugin:pd-proof]` prefix.
- **`seo` cannot be written from a sandbox on the Node runner.** The bridge `content/update` (`@emdash-cms/sandbox-workerd/dist/runner-*.mjs`, `contentUpdate`) passes the whole `data` object to `updateDraftAware` as column data, so `seo` is treated as an unknown field. The native path handles `seo` separately (`plugins/context.ts:872-883`, #25 fact 14). I did not test the Cloudflare Worker Loader runner. Ask upstream (card #21) before relying on it there.
- Build gotcha: `const plugin = {...} satisfies SandboxedPlugin;` fails the CLI build with `TS2883: The inferred type of 'plugin' cannot be named without a reference to 'PluginStorageConfig'`. Use `const plugin: SandboxedPlugin = {...}` as the scaffold does. AGENTS.md says to use `satisfies` for plugdash sandbox entries built by tsdown. That is true for the config-declared path but not for `emdash-plugin build`.

### Not done in the proof

- No production build of the site with the sandbox (dev only).
- No install through the admin UI, because that needs a published release in a registry.
- No Cloudflare Workers run.
- No test of a real plugdash plugin in the sandbox. `pd-proof` stands in for one.

## Publish checklist (about 30 minutes for the first plugin)

Do this for `autobuild` first. It is the smallest real candidate. The converted plugin must exist first (card #12 merged and rewritten to the `emdash-plugin` layout: `emdash-plugin.jsonc`, `src/plugin.ts`, settings instead of options). The commands below come from the official docs and the CLI help; the first four steps and the build/bundle/validate steps were run on `pd-proof`, the login and publish steps were not run.

1. **Atmosphere account (5 min).** Use a Bluesky account or any AT Protocol account. A dedicated one for plugdash is cleaner than a personal handle. Note the **DID** (`did:plc:...`): `curl https://bsky.social/xrpc/com.atproto.identity.resolveHandle?handle=<handle>`. Docs say pin `publisher` to the DID, not the handle.
2. **Pick the slug.** The registry name becomes `@<handle>/<slug>`. Slugs cannot be changed later, versions cannot be replaced.
3. **Write `emdash-plugin.jsonc`** (or run `npx @emdash-cms/plugin-cli init <slug> --publisher <did> --author-name ... --security-email ... --repo https://github.com/plugdash/plugdash`). Required: `slug`, `publisher`, `license` (MIT), `author`, a security contact (`security.email` or `.url`), `version` (manifest or `package.json`). Set `description`, `keywords`, and `repo` (needed for provenance).
4. **Declare the permission contract.** For autobuild: `"capabilities": ["content:read", "network:request"]`, `"allowedHosts": ["api.cloudflare.com", "api.netlify.com", "api.vercel.com"]` (add `api.github.com` if wanted), `"storage": {}`, and `admin.settingsSchema` with a `hookUrl` field of `type: "secret"`. These become the consent screen. Any later change to capabilities or hosts means a major version.
5. **Check limits.** `pnpm run validate`, then `pnpm run bundle`. Must be under 256 KB total, 128 KB per file, 20 files, no `node:` imports. No `satisfies` on the plugin export (see Proof).
6. **Test in the sandbox.** Install with `pnpm add file:../<plugin>` in a blog-template site, `sandboxed: [...]` plus `sandboxRunner: "@emdash-cms/sandbox-workerd/sandbox"`, and run the card's e2e against it in dev and in a production build. Cloudflare is the real target: the registry install on Workers needs the paid plan with Worker Loader.
7. **Log in.** `pnpm exec emdash-plugin login <handle>`. This is AT Protocol OAuth with a loopback callback in the browser. `emdash-plugin whoami` must show the same DID as `publisher`; otherwise `emdash-plugin switch <did>`.
8. **Publish.** `pnpm exec emdash-plugin publish`. It rebuilds, validates the decompressed limits, checks the publisher pin, checks the OAuth grant covers blob upload, uploads the package to your PDS, verifies the blob CIDs, then writes the package profile (first time) and an immutable release record. The records are signed by your account (this is the "signed commit": an AT Protocol repo commit, not a git commit). The runtime later checks the signed commit, then checksum, package name, version, requested access, and any required provenance.
9. **Provenance (optional, do it for plugdash).** With a canonical HTTPS `repo` in the profile, publish can carry provenance. To make it mandatory and publish from GitHub Actions: `pnpm exec emdash-plugin release setup` (generates the workflow, then tag `<slug>@<version>`, for example `autobuild@1.0.0`). Releases from that workflow are create-only. If a profile requires provenance, a manual `publish` is refused.
10. **Listing images (optional).** `release.artifacts` in the manifest: `icon` (256x256 PNG), `banner`, up to 8 `screenshots`.
11. **Verify.** `npx @emdash-cms/registry-cli search <slug>` and `info`, then on the test site install from the admin panel (needs `plugins:manage`, a configured sandbox runner, and the default registry `https://registry.emdashcms.com`). The `plugin:install` hook fires here.
12. **Next releases.** Bump the version every time. Never use `--allow-overwrite` except as recovery (it can trigger takedown events). New hooks or routes: minor. New capabilities or hosts: major.

Risks to tell users (from the Help Net Security article, 2026-09-29): a hijacked publisher account produces valid signatures, so protect the account with a strong passphrase and 2FA, and moderation can hide a listing but cannot remove a published release.

## Open questions for upstream (card #21)

1. Can sandboxed `ctx.content.update` accept `seo` (and `ctx.seo`)? Today it throws `Unknown field 'seo'` on the Node runner.
2. Can the registry list a package whose only content is an Astro component or a Portable Text block (a "component" listing with no backend)?
3. Is there a supported way for a registry plugin to register a Portable Text block with a renderer shipped by the registry?
4. Does the Cloudflare Worker Loader runner behave the same for `seo` and for CPU limits on large hooks?

## Sources

- https://docs.emdashcms.com/plugins/installing/
- https://emdashcms.com/blog/emdash-plugin-registry
- https://emdashcmseverything.com/official-docs/plugins/creating-plugins/publishing/
- https://newreleases.io/project/github/emdash-cms/emdash/release/@emdash-cms/registry-cli@0.1.0
- https://www.helpnetsecurity.com/2026/09/29/cloudflare-emdash-plugin-security/
- Local: `emdash@1.0.1` source, `@emdash-cms/sandbox-workerd@0.9.2`, `@emdash-cms/plugin-cli@0.13.2` (schema and `init --help`)
- #25 recheck (PR #42), #01 pattern (PR #44)
