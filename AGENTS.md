# PlugDash

Plugin catalog for EmDash (emdashcms.com). pnpm monorepo. MIT license.
All packages published to npm under @plugdash/.

---

## what this is

Quality plugins for EmDash, built with explicit capability declarations.
Standard (sandboxed) plugins export a bare object `satisfies SandboxedPlugin`;
Native plugins use `createPlugin()` wrapped in `definePlugin()`. No thin API wrappers — every plugin
owns its logic. Every plugin ships a companion UI component that works
beautifully out of the box with no configuration required.

---

## self-improvement rule

**Update this file whenever you discover something new.**

If a capability name turns out to be wrong, correct it here.
If a hook payload shape differs from what is documented, fix it here.
If an EmDash API behaves differently than expected, record it here.
If a pattern causes a test failure that reveals a misunderstanding, add it here.

This file is the institutional memory of the repo. A stale AGENTS.md costs
every future session a wrong plan. Keep it current.

When updating, add a dated note:

```
// confirmed 2026-04-05 while building @plugdash/shortlink
ctx.kv.get() returns null (not undefined) for missing keys
```

---

## repo structure

```
plugdash/
├── packages/                # one dir per plugin
│   └── readtime/
│       ├── src/
│       │   ├── index.ts           # PluginDescriptor factory
│       │   ├── sandbox-entry.ts   # satisfies SandboxedPlugin, with hooks
│       │   └── ReadingTime.astro  # companion UI component
│       ├── tests/
│       │   ├── index.test.ts      # unit tests
│       │   └── integration.test.ts
│       ├── SKILL.md
│       ├── README.md
│       └── package.json
├── shared/
│   ├── types/src/index.ts   # EmDash API types — keep updated
│   └── testing/src/index.ts # makeContext(), makeContentItem()
├── testbed/                 # minimal EmDash site for integration tests
│   ├── astro.config.mjs     # all plugins registered here
│   └── fixtures/
├── e2e/                     # Playwright functional tests
├── skills/
│   └── creating-plugins/
│       └── SKILL.md         # agent skill for plugin creation
├── AGENTS.md                # this file
└── CLAUDE.md -> AGENTS.md  # symlink
```

Planning artifacts (PLAN.md, TODO.md) are kept outside this repo.
Their location will be specified per session via the prompt.
Never write planning files into `packages/`. The monorepo stays clean.

---

## toolchain

- **pnpm** — not npm, not yarn. Always `pnpm add`, never `npm install`.
- **tsdown** — builds ESM + DTS. Use `tsdown src/index.ts` in build script.
- **vitest** — test runner. `pnpm test` from root runs all packages.
- **oxlint** — linter. `pnpm lint` runs it.
- **oxfmt** — formatter. **Tabs, not spaces.** Always. `pnpm format` fixes it.
- **changesets** — independent per-package versioning.
- **OIDC publishing** — no NPM_TOKEN for packages already published once.

Run `pnpm lint` after every edit. It takes under a second.
Never let formatting pile up. Run `pnpm format` before committing.

---

## confirmed API facts

Verified against the actual EmDash source while building @plugdash/readtime.
These supersede anything in plugin specs if there is a conflict.

### confirmed 2026-09-27 on EmDash 0.41

Rechecked against EmDash 1.0.1 in docs/emdash-1.0-recheck.md (card #25). Facts that changed on 1.0.1 are marked below, and the extra 1.0.1 facts are listed after fact 17.

Measured by running all 13 packages on a real site from the official blog
template, in dev and in a production build. The unit-test mocks do not model
EmDash, so green tests proved none of this. Paths are in
`node_modules/emdash/src`. Where this section disagrees with an older entry
below, this section wins.

**Facts**

1. Publish fires `content:afterPublish`, not `content:afterSave`
   (`emdash-runtime.ts` `handleContentPublish` -> `runAfterPublishHooks`).
   `afterSave` fires only on create and update.
2. The admin autosaves 2 s after each typing pause (`AUTOSAVE_DELAY = 2e3`,
   `PUT` with `skipRevision: true`). Each autosave fires `afterSave`. On a
   published post the autosave writes to the draft, so the live page does not
   change.
3. On collections with `revisions` (posts in every template),
   `ctx.content.update()` writes to the draft revision
   (`ContentRepository.updateDraftAware`) and `ctx.content.get()` reads the
   live row (`findById`). Two plugins that read-merge-write the same field
   overwrite each other.
4. `plugin:install` fires only for marketplace and registry installs. It never
   fires for plugins registered in `astro.config.mjs`.
5. Standard-format plugins do not get descriptor `options` at runtime. The
   generated module passes only `id, version, capabilities, allowedHosts,
   storage, adminPages, adminWidgets, editorPanels, editorActions,
   settingsSchema, portableTextBlocks, fieldWidgets`
   (`astro/integration/virtual-modules.ts`). Native plugins get
   `createPlugin(options)` with the options inlined as JSON. This works in
   production (codeblock `theme` proves it).
6. `globalThis` values set in the descriptor factory do not reach the
   production server, because `astro.config.mjs` runs in the build process.
7. `ctx.settings.get(key)` returns `null` when no value is stored. It does not
   apply the `settingsSchema` default.
8. Sandboxed-format hooks time out after 5,000 ms by default
   (`plugins/adapt-sandbox-entry.ts` `DEFAULT_TIMEOUT`). Set `timeout` on the
   hook entry (`{ timeout, handler }`) to change it. The timeout does not
   cancel the work that is running.
9. Official templates (blog, starter, marketing, portfolio, and their
   Cloudflare versions) have no `metadata` field, and the Portable Text field
   is named `content`, not `body`.
10. `getEmDashEntry()` returns entries where `entry.id` is the slug and
    `entry.data.id` is the ULID.
11. Plugin routes are served at `/_emdash/api/plugins/<pluginId>/<route>`.
    Responses are wrapped: `{ "success": true, "data": { ... } }`.
12. EmDash has native redirects: `ctx.redirects.create()` with capability
    `redirects:write`, an in-memory cache in middleware (0 queries on warm
    requests), hit counts, 410 support, automatic redirect on slug change, and
    an admin "Redirects" screen (`astro/middleware/redirect.ts`).
13. `OptionsRepository.getByPrefix()` runs `name LIKE 'prefix%'`. SQLite gives
    `SCAN options`, which reads every row. Plugin KV lives in this table
    (`plugin:<id>:<key>`).
14. Code reading only, not yet run: `ctx.content.update(collection, id, { seo:
    { image } })` with no field changes skips the draft and upserts the SEO
    table, so it is live at once. `getSeoMeta()` uses `seo.image` before the
    featured image.
15. The admin import screen supports only WordPress. Sources registered with
    `registerSource()` have no UI or API entry point.
16. The blog template has no page cache and no `site` in `astro.config.mjs`.
    Each page view renders on the server. CHANGED on 1.0.1: `ctx.url()` and
    `ctx.site.url` are absolute after setup. They come from the
    `emdash:site_url` option, written once from the setup request origin
    (`astro/routes/api/setup/index.ts:118`, `dev-bypass.ts:136`,
    `emdash-runtime.ts:1598-1617`, `plugins/context.ts:1406-1418`). Before
    setup they are empty or relative. The stored value can be stale (a
    production run on a copied dev DB returned the dev host), so rule E still
    holds: build URLs at render time from the request.
17. Cloudflare limits: Workers Free = 10 ms CPU per request and 100,000
    requests/day. D1 Free = 5 M rows read/day and 100,000 rows written/day. D1
    bills every row a query scans.

Added on 1.0.1 (card #25):

18. Unknown data fields (e.g. `metadata`) throw `EmDashValidationError`
    "Unknown field 'metadata' in collection 'posts'"
    (`database/repositories/content.ts:1261-1264`), not a SqliteError.
19. Secret settings need the `EMDASH_ENCRYPTION_KEY` env var
    (`plugins/settings.ts:85-98`).
20. Plugin media uploads reject SVG (`GLOBAL_UPLOAD_ALLOWLIST`,
    `api/handlers/media-allowlist.ts:11-28`).
21. Standard plugin routes get `(routeCtx, ctx)`; native routes get one full
    `ctx` with a real `Request` (`plugins/adapt-sandbox-entry.ts:222-280`). A
    thrown error that is not a `PluginRouteError` reaches the client as 500
    `INTERNAL_ERROR` "Plugin route error".

**Design rules**

- **A. Hooks.** Paid or heavy side effects run only in `content:afterPublish`.
  autobuild also uses `content:afterUnpublish`, and `content:afterDelete` only
  for items that were published. No plugin does paid or heavy work in
  `content:afterSave`.
- **B. Storage.** Store a computed value only when it is expensive or paid to
  compute (enrichkit, socialcard, codeblock HTML), or when it comes from
  outside the page (heart counts, short links). Compute everything else in the
  component at render time. Measured cost of readtime + tocgen + sharepost at
  render time: 0.25 ms CPU per render.
- **C. No shared `metadata`.** Never write to a shared `metadata` field. Use
  plugin KV or storage, a native EmDash feature (redirects, `seo`), or the
  node itself in `content:beforeSave`.
- **D. Config.** Render-time plugins take config as component props, with no
  database read. Plugins with hooks take config through native
  `createPlugin(options)` (see [docs/plugin-pattern.md](./docs/plugin-pattern.md)).
  No `globalThis` bridge from the descriptor factory. Secrets use a
  `settingsSchema` field with `type: "secret"` or the admin page.
- **E. URLs.** Build absolute URLs at render time: prop `url` if given, else
  `new URL(Astro.url.pathname, Astro.site ?? Astro.url.origin)`. Never store an
  absolute URL.
- **F. Body field.** Option `field` if given, else `data.content`, else
  `data.body`, else the first array value in `data` whose items have `_type`.
- **G. Entry id in components.** Use `post.data.id ?? post.id`. `post.id` is
  the slug.
- **H. Hooks never throw.** When required config is missing, log one clear
  warning. Never return silently.
- **I. Per-visitor data** never goes into `options`. Use `ctx.storage` (own
  indexed table) or the browser.

The pattern for native plugins with hooks is in
[docs/plugin-pattern.md](./docs/plugin-pattern.md).

### cost rules

- No paid or heavy work in `afterSave`. It runs on every autosave.
- Compute cheap derived data (reading time, table of contents, share URLs) at
  render time. Do not store it.
- Never write per-visitor rows to `options` or plugin KV. Every KV prefix scan
  reads the whole `options` table (fact 13). Use `ctx.storage`.
- Lazy-import heavy libraries (shiki, linkedom, satori) inside the code path
  that needs them, so they do not load on every request or cold start.

// confirmed 2026-09-22 during Track B audit, emdash core CHANGELOG 0.13.0 (PR #1057)
`definePlugin()` is BREAKING-removed for sandboxed-format (Standard) plugins
as of emdash core 0.13.0. `sandbox-entry.ts` no longer wraps its export in
`definePlugin()` - it is a bare default export with a `satisfies
SandboxedPlugin` annotation, typed via `import type { SandboxedPlugin } from
"emdash/plugin"` (type-only, erased at bundle time, no runtime `emdash`
import remains). Explicit parameter type annotations on hook/route handlers
also go away - the mapped `SandboxedPlugin` type infers them per hook/route
name. This does NOT affect Native plugins: `createPlugin()` still requires
wrapping in `definePlugin()` per the entry below. Every published plugdash
package's `peerDependencies.emdash` must allow `>=0.13.0` (not `^0.1.0`) for
`emdash/plugin` to resolve - the npm-published `emdash` package didn't gain
the `./plugin` export until well after 0.1.0.

// confirmed 2026-04-05 during plugdash.dev integration fixes
Native plugins must include `hooks: {}` in the object returned by
createPlugin(). HookPipeline iterates plugin.hooks without a presence
check and crashes with a TypeError when the key is absent. Even if the
plugin declares zero hook handlers, the empty object must be present.

// confirmed 2026-04-06 during plugdash.dev plugin-manager crash fix
Native `createPlugin()` MUST wrap its return value in `definePlugin()`
from emdash. Returning a raw object (even with `hooks: {}`) leaves
`capabilities`, `allowedHosts`, `storage`, and `routes` undefined.
EmDash's plugin list API reads `plugin.capabilities` directly, serializes
it as undefined, and the admin Plugin Manager UI crashes on
`plugin.capabilities.length`. definePlugin() normalizes all required
ResolvedPlugin fields with sensible defaults. This is the same pattern
the emdash CLI scaffolding uses - match it for every native plugin.

// confirmed 2026-09-25 while fixing @plugdash/shortlink sandboxed build
A sandboxed plugin's `sandbox-entry.ts` must not import any other local
file in the package (e.g. `import { isValidCode } from "./redirect-logic"`).
emdash's `generateSandboxedPluginsModule` (astro integration) reads only
the single entry file and embeds it as a string - it never resolves a
sibling import, so the sandboxed plugin fails to load even though trusted
(non-sandboxed) mode works fine and tests pass. Shared logic a sandboxed
entry needs must live in a package dependency instead (e.g.
`@plugdash/types`), which tsdown inlines into the bundle - the same way
`isRecord` is already imported. Also: when a package builds multiple
tsdown entries that share such a dependency, run tsdown once per entry
(`tsdown src/a.ts && tsdown src/b.ts --no-clean`) rather than one
invocation with multiple entries - a single multi-entry invocation makes
tsdown split the shared code into its own chunk file and import it,
which reintroduces the same cross-file-import problem.

// confirmed 2026-09-26 after the socialcard/fromghost/fromsubstack 0.1.0 publish
Never `npm publish` a package by hand. dist/ is gitignored and no package
has a prepack build, so a manual publish ships whatever local dist/ exists
(nothing, or a stale build). `npm publish` also leaves `workspace:*`
specifiers in place. Always `pnpm build && pnpm publish`. Private shared
packages (`@plugdash/html-to-portable-text`) must be devDependencies so
tsdown inlines them - listing one under `dependencies` makes it external
and the published package uninstallable. Their own runtime deps (linkedom)
go in the consuming plugin's `dependencies`.

// confirmed 2026-09-26 while fixing @plugdash/codeblock theme config
A native plugin's `componentsEntry` block components receive only the
Portable Text `node` - descriptor `options` never reach them. EmDash's
generated plugins module calls `createPlugin(options)` (options inlined as JSON)
in the server runtime (virtual-modules.ts), so the bridge is: store the
options on globalThis inside `createPlugin()`, read them in the
component. Use globalThis, not a module variable - the component is
imported from `src/` while createPlugin runs from bundled `dist/`, so
they are different module instances. Setting globalThis in the
descriptor factory does NOT work in production: astro.config runs in
the build process, not the worker.

// confirmed 2026-04-05 during plugdash.dev integration fixes
Never import a `.d.ts` / declaration file at runtime (e.g.
`import "./globals.d.ts"`). tsdown bundles the import as a real module
reference in dist/, and Node refuses to execute the emitted
`import "./globals-xxxx.d.mts"`. For ambient global types, rely on
tsconfig `include` to pick up the .d.ts file - no import statement is
needed in runtime source.

// confirmed 2026-04-05 during plugdash.dev integration fixes
Never use `::-webkit-details-marker` in Astro `<style>` blocks. Astro's
scoped CSS parser cannot handle it and will throw. Use
`summary { list-style: none; }` instead - modern browsers honour this
on summary elements.

// corrected 2026-09-27 (supersedes three 2026-04-05 readtime entries)
Do not seed config into KV from `plugin:install`, and do not bridge descriptor
options through a `globalThis` bootstrap plus a bootstrap hash. `plugin:install`
never fires for plugins in `astro.config.mjs` (fact 4) and the globalThis
bridge does not reach production (fact 6). Render-time plugins take props;
plugins with hooks use native `createPlugin(options)` (rule D).

// confirmed 2026-04-05 during readtime collections-bug fix
`ctx.content.update()` can crash with
`SqliteError: no such column: <field>` on 0.41 (on 1.0.1 it is an
`EmDashValidationError` "Unknown field", fact 18) when the target collection
lacks the field being written (e.g. system collections like `plugins`). Wrap
`ctx.content.update()` calls in try/catch (rule H: hooks never throw) and use a
collections allowlist to avoid the crash in the first place.

### capability names

// corrected 2026-09-22 during Track B audit - old names below are deprecated
The deprecated capability names (`read:content`, `write:content`,
`read:media`, `write:media`, `read:users`, `network:fetch`,
`network:fetch:any`, `email:provide`, `email:intercept`, `page:inject`)
still work as runtime aliases but must not be used in new or edited code.
Use the canonical names: `content:read`, `content:write`, `media:read`,
`media:write`, `users:read`, `network:request`,
`network:request:unrestricted`, `hooks.email-transport:register`,
`hooks.email-events:register`, `hooks.page-fragments:register`.

`write:metadata` does not exist. Use `content:write` for any plugin that
calls `ctx.content.update()`. Confirmed capabilities that exist:
`content:read`, `content:write`, `media:read`, `media:write`,
`network:request`, `users:read`, `email:send`.

// corrected 2026-04-05 while building @plugdash/autobuild
The network capability is literally `"network:request"`, not
`"network:[hostname]"`. Hostnames go in a separate `allowedHosts` array
on the PluginDescriptor, which supports wildcards. Example:

```typescript
capabilities: ["content:read", "network:request"],
allowedHosts: ["api.cloudflare.com", "*.googleapis.com"],
```

Verified in emdash-source/skills/creating-plugins/SKILL.md lines 189,
211-214, 420, 438-439.

// confirmed 2026-04-05 while building @plugdash/shortlink
`read:kv` and `write:kv` do not exist as capabilities. KV is auto-available
to all plugins without declaring any capability. ctx.kv is always present.
`write:routes` does not exist as a capability. Routes are declared in the
sandbox-entry.ts export's `routes` field and need no capability declaration.

// confirmed 2026-04-05 while building @plugdash/heartpost
`routeCtx.input` for POST routes is pre-parsed JSON. The EmDash runtime
calls `await request.json()` in emdash-runtime.ts before invoking the
route handler. No JSON.parse() needed in the handler - cast directly:
`const { id } = routeCtx.input as Record<string, unknown>`
Verified in emdash-source/packages/core/src/emdash-runtime.ts lines 1793-1800.

// confirmed 2026-09-22 while building @plugdash/heartpost
Real `SandboxedRequest.headers` (emdash 0.38.0) is a plain `Record<string, string>`, not a DOM `Headers` object.

### ctx.content.update() signature

Three arguments: `ctx.content.update(collection, id, data)`

```typescript
// wrong
await ctx.content.update(id, { excerpt: value });

// right
await ctx.content.update(collection, id, { excerpt: value });
```

### update() is column-level, not document-level

EmDash stores each data field as its own database column. Sending
`{ excerpt: X }` updates only that column. On revisioned collections the write
goes to the draft revision, not the live row (fact 3). Never write to a shared
`metadata` field (rule C) - it does not exist in the official templates
(fact 9).

### content is Portable Text

EmDash stores content as Portable Text (structured JSON arrays), not HTML.
Never strip HTML tags. Traverse Portable Text nodes:

```typescript
import type { PortableTextBlock } from "@portabletext/types";

function extractText(blocks: PortableTextBlock[]): string {
  return blocks
    .filter((b) => b._type === "block")
    .flatMap((b) => b.children ?? [])
    .filter((c) => c._type === "span")
    .map((c) => c.text ?? "")
    .join(" ");
}
```

### hook event payload shape

`content:afterSave` and `content:afterPublish` receive:

```typescript
interface ContentHookEvent {
  content: Record<string, unknown>; // spread ContentItem
  collection: string;
  isNew: boolean;
}
```

System fields are at **top level**. Custom fields are under **`data`**:

```typescript
// System fields — top level on event.content
event.content.id; // ✅ top level
event.content.status; // ✅ top level — "published"|"draft"|"archived"|"scheduled"
event.content.slug; // ✅ top level
event.content.createdAt; // ✅ top level
event.content.updatedAt; // ✅ top level
event.content.publishedAt; // ✅ top level

// Custom fields — under event.content.data
event.content.data.title; // ✅ nested under data — NOT a system field
event.content.data.content; // ✅ nested under data - Portable Text array (templates name it `content`; see rule F)
event.content.data.[any]; // ✅ all user-defined fields live here

// Collection is on the event itself, not on content
event.collection; // ✅ on the event object

// Common mistakes
event.content.title; // ❌ WRONG — title is under data, not top level
event.content.content; // ❌ WRONG - does not exist at top level
```

// confirmed 2026-04-05 while building @plugdash/sharepost
`title` is a custom data field, not a system field. CLI reads `item.data?.title`,
repository reads `newData.title` where `newData = { ...original.data }`,
content handler tests create items with `data: { title: "Hello World" }`.
Every plugin that needs the post title must read `event.content.data.title`.

### standard plugins cannot access descriptor options at runtime

The `options` field on PluginDescriptor is native-format only (fact 5).
Standard plugins have no build-time config path, and `plugin:install` does not
run for them (fact 4). Options for a Standard plugin: take props in the
component, or read `ctx.settings` (returns `null` when unset, fact 7, so apply
your own default). Plugins with hooks that need build-time options are Native.

### two-file plugin structure is required for standard plugins

Every Standard plugin requires two files:

```
src/index.ts          → PluginDescriptor factory (Vite build time)
src/sandbox-entry.ts  → bare object satisfies SandboxedPlugin, with hooks (request time)
```

package.json must export both:

```json
{
  "exports": {
    ".": "./dist/index.js",
    "./sandbox": "./dist/sandbox-entry.js",
    "./[ComponentName].astro": "./src/[ComponentName].astro"
  }
}
```

The descriptor's entrypoint references the sandbox export:
`entrypoint: "@plugdash/readtime/sandbox"`

### standard vs native

**Standard** — default. Works in sandboxed mode. Can be published to marketplace.
Use unless the plugin needs Astro components or Node.js built-ins.

**Native** — escape hatch. Needs `native: true` in descriptor. Cannot be sandboxed.
Required for: block type plugins (Astro renderers), import plugins (Node.js fs/zip).

Plugins that must be Native: `callout`, `codeblock`, `chartblock`,
`fromsubstack`, `fromghost`, `frommedium`

### http calls use ctx.http.fetch(), not fetch()

```typescript
// wrong — breaks in sandboxed Workers
const res = await fetch("https://api.example.com");

// right — works in both trusted and sandboxed
const res = await ctx.http.fetch("https://api.example.com");
```

Declare the network capability as `"network:request"` and list hostnames in
`allowedHosts` on the descriptor (wildcards supported):

```typescript
capabilities: ["network:request"],
allowedHosts: ["api.example.com", "*.googleapis.com"],
```

### isRecord() lives in shared/types

```typescript
import { isRecord } from "@plugdash/types";

// use before accessing event.content.data
if (!isRecord(event.content.data)) return;
```

Never rewrite this utility. Import it.

---

## what agents get wrong in this repo — known failure modes

**1. Proceeding past a stage gate without stopping**
The stage system exists for approval checkpoints. Stop and wait.
If you move from Stage 1 to Stage 2 without approval, stop, revert, and stop.

**2. Reading event.content.body or event.content.data.body**
Custom fields live under `data`, and the Portable Text field is `content` in
every official template. Resolve it with rule F.

**3. Using write:metadata as a capability**
Does not exist. Always write:content.

**4. Two-arg ctx.content.update(id, data)**
Always three args: (collection, id, data).

**5. Using global fetch() in sandbox-entry.ts**
Use ctx.http.fetch(). Global fetch is silently blocked in Workers isolates.

**6. Writing PLAN.md or TODO.md into packages/**
Planning files (PLAN.md, TODO.md) go outside this repo in the location specified by your session prompt. Never in the monorepo.

**7. Relying on plugin:install**
It never fires for plugins registered in astro.config.mjs (fact 4). Do not
seed config there.

**8. Forgetting to export the Astro component in package.json**
Astro components are not compiled by tsdown. They export from src/, not dist/.
The exports field must explicitly list each .astro file.

**9. Writing a shared metadata field**
Never write shared `metadata`, merged or not. It does not exist in the
templates and read-merge-write races on revisioned collections. See rule C.

**10. Using spaces instead of tabs**
oxfmt uses tabs. Any file with spaces will fail formatting check.
Run `pnpm format` to fix before committing.

**11. Returning a raw object from native createPlugin()**
Always wrap the object in `definePlugin()` from emdash. Without it,
capabilities/allowedHosts/storage/routes are undefined and the admin
Plugin Manager UI crashes on `plugin.capabilities.length`. Match the
scaffolding template.

**12. Doing paid or heavy work in afterSave, or trusting mocks**
afterSave fires on every autosave and never on publish (facts 1, 2). Use
`afterPublish` (rule A). Unit tests with mocks passed while most plugins did
nothing on a real site; accept a plugin only after it passes on the blog
template in dev and production.

---

## build and test cycle — mandatory order

Every plugin must go through all stages in order. No skipping.

```
STAGE 1 — PLAN
Write PLAN.md to the location specified in your session prompt.
Cover: file structure, key functions, capability usage, edge cases,
       EmDash API uncertainties that need resolving before coding.
Stop. Wait for approval.

STAGE 2 — TODO
Write TODO.md to the location specified in your session prompt.
Flat checklist, implementation order, each item independently verifiable.
No subtasks. No headers. Just checkboxes.
Stop. Wait for approval.

STAGE 3 — FAILING TESTS
Write packages/[name]/tests/index.test.ts
Every test must fail. Run pnpm test to confirm.
Failure mode: import errors are acceptable at this stage.
Stop. Wait for approval.

STAGE 4 — IMPLEMENT
Write src/index.ts, src/sandbox-entry.ts, src/[Component].astro
Run pnpm test after each logical unit — not just at the end.
All tests must pass before continuing.
Stop. Wait for approval.

STAGE 5 — INTEGRATION TESTS
Write packages/[name]/tests/integration.test.ts
Use EmDashTestClient from @plugdash/testing.
If testbed is not running, write comprehensive mocks and note this.
Register plugin in testbed/astro.config.mjs — this file exists, register
every new plugin here as part of Stage 5.
Stop. Wait for approval.

STAGE 5b — FUNCTIONAL TESTS (e2e)
Write e2e/[name].spec.ts using Playwright and the real-EmDash harness
in e2e/harness (card #04). It runs against a real EmDash site made from the
blog template, not mocks.
Run: pnpm e2e (dev server) and pnpm e2e:prod (production build).
The plugin must pass on the blog template in both dev and production.
Stop. Wait for approval.

STAGE 6 — DOCUMENTATION
Write packages/[name]/README.md — opens with the problem, not the feature.
Write packages/[name]/SKILL.md — includes ## for agents section.
Update root README.md plugin table.
Stop. Wait for approval.

STAGE 7 — WEBSITE CONTENT
Write testbed/fixtures/plugins/[name].json — catalog entry for plugdash.dev.
```

**Smoke tests run on every push (automated):**
`pnpm build && pnpm typecheck && pnpm lint && pnpm test && pnpm smoke`

**Integration tests run on PR (automated):**
Requires testbed running on localhost:4321 (not a substitute for stage 5b)

**Functional tests run before release (automated):**
`pnpm e2e` and `pnpm e2e:prod` against a real EmDash site

## playwright / e2e tests

e2e specs live in e2e/. `pnpm e2e` starts a real EmDash blog-template site
in dev and runs the specs; `pnpm e2e:prod` builds the site and runs the same
specs against the production server. Dev-bypass login does not exist in
production, so the harness handles the session. Plugin logs go to
`.astro/dev.log` on the site, not stdout.

---

## every plugin ships a UI component

This is non-negotiable. A plugin that stores data but ships no visual
surface is incomplete. The companion component is part of the plugin.

### the standard

The default component must be genuinely good — not a skeleton.
A developer who drops `<ReadingTime post={post} />` into their layout
should not need to touch it. The output should make them think
"I don't need to change this."

### design system

Font: `"Lexend", system-ui, sans-serif` for UI. `"IBM Plex Mono", monospace` for code.

```css
/* all components use these tokens */
:root {
  --plugdash-font-ui: "Lexend", system-ui, sans-serif;
  --plugdash-font-mono: "IBM Plex Mono", monospace;
  --plugdash-muted: rgb(from currentColor r g b / 0.55);
  --plugdash-accent: #6366f1;
  --plugdash-accent-fg: #ffffff;
  --plugdash-border: rgb(from currentColor r g b / 0.12);
  --plugdash-surface: rgb(from currentColor r g b / 0.05);
  --plugdash-transition: 150ms ease;
  --plugdash-size-xs: 0.75rem;
  --plugdash-size-sm: 0.875rem;
  --plugdash-size-md: 1rem;
  --plugdash-radius-sm: 4px;
  --plugdash-radius-md: 8px;
  --plugdash-radius-full: 9999px;
}
```

Using `rgb(from currentColor r g b / 0.12)` for borders means components
adapt to any background colour without configuration. This is the key
technique that makes components genuinely portable.

### four variants, every visual component

```typescript
variant: "circle"; // icon in circle — default for engagement components
variant: "pill"; // icon + label in pill
variant: "ghost"; // text/icon only, no border
variant: "filled"; // solid accent background
```

Size: `sm` (24px/small) · `md` (32px/default) · `lg` (40px)
Theme: `auto` (default, follows prefers-color-scheme) · `dark` · `light`

### component requirements — every companion component must

1. **Render nothing when data is missing** — never throw or show broken UI
2. **Use CSS custom properties for all visual values** — no hardcoded colours
3. **Accept a `class` prop** — additional CSS class for layout control
4. **Accept customisation props** — label, variant, size, theme at minimum
5. **Use `--plugdash-*` token namespace** — for consistency across components
6. **Work in dark and light themes** — via `auto` theme default

### export pattern

```json
{
  "exports": {
    ".": "./dist/index.js",
    "./sandbox": "./dist/sandbox-entry.js",
    "./ReadingTime.astro": "./src/ReadingTime.astro"
  }
}
```

Astro files export from `src/`, not `dist/` — tsdown does not compile them.

### engagement bundle

`heartpost` + `sharepost` + `shortlink` together form the engagement bar:

```
[♥ 12]  [𝕏] [in] [B]  [⎘]
```

The convenience package `@plugdash/engage` provides `EngagementBar.astro`
which renders all three. Same variant, size, and theme props across all three
so they are visually identical in a row.

Engagement bar tokens:

```css
:root {
  --plugdash-engage-gap: 0.375rem;
  --plugdash-engage-size: 2rem;
  --plugdash-engage-radius: 9999px;
  --plugdash-engage-border: rgb(from currentColor r g b / 0.15);
  --plugdash-engage-bg: rgb(from currentColor r g b / 0.04);
  --plugdash-engage-bg-hover: rgb(from currentColor r g b / 0.08);
  --plugdash-engage-transition: 150ms ease;
  --plugdash-heart-color: var(--plugdash-accent, #6366f1);
  --plugdash-heart-fill-duration: 200ms;
  --plugdash-copy-success-color: #22c55e;
}
```

---

## plugin authoring rules

**Never throw to the host from a hook handler.**
A plugin failure must not fail the content operation that triggered it.
Wrap all hook logic in try/catch. Log errors, return gracefully.

**Fire-and-forget for non-critical side effects.**
KV writes that track analytics must not block the response.

```typescript
// analytics write — fire and forget
ctx.kv
  .increment(`clicks:${code}`)
  .catch((err) => ctx.log.error("clickcount: kv write failed", { err }));

// critical write — await
await ctx.content.update(collection, id, { excerpt: value });
```

**Pick the right hook.**
Paid or heavy work goes in `content:afterPublish` (rule A). `afterSave` fires
on every autosave, so keep it free of side effects. In `afterPublish` the
item is already published; no status check is needed.

**Always guard capability contexts.**

```typescript
if (!ctx.content) {
  ctx.log.error("readtime: content capability not available");
  return;
}
```

**Never write shared metadata.**
See rule C. Store expensive values in plugin KV or `ctx.storage`, or compute
them at render time (rule B).

**Idempotency rule.**
Every plugin that creates records must be safe to run twice:

- Stored enrichment (enrichkit, socialcard): overwrite is fine
- Record creation (shortlink, redirect, receipt): check existence first

**Config via props or createPlugin(options).**
Render-time plugins take props. Plugins with hooks use native
`createPlugin(options)` (rule D). No KV seeding, no globalThis bridge.

**Namespace your KV keys.**
Pattern: `[plugin]:[discriminator]:[secondary]`

```
readtime:config:wordsPerMinute
shortlink:abc1:data
clickcount:abc1:2026-04-05
heartpost:post-123:fp-a3b9c1
```

**No Node.js built-ins in Standard plugins.**
No fs, path, child_process, crypto (use ctx.crypto instead).
If you need Node.js, the plugin must be Native.

---

## skill.md structure — every plugin

```markdown
# skill: [name]

## what it does

[Two sentences. What observable effect does this produce?]

## plugin type

Standard | Native

## capabilities declared

[code block]

## hooks

[which hooks, when they fire]

## install

npm install @plugdash/[name]

## register

[astro.config.mjs snippet]

## companion component

[import + usage + CSS token table]

## configuration

[options table: option | type | default | description]

## what it does not do

[explicit non-features list]

## for agents

After installing @plugdash/[name] and registering it:

1. [step one — usually import the companion component]
2. [step two — add to layout]
3. [step three — verify]

Metadata written: [field paths and types]
Companion component: [ComponentName.astro import path]
```

The `## for agents` section is mandatory. It tells an AI agent working in
an EmDash site exactly what to do after install, without reading the README.

---

## README first paragraph convention

Every README opens with the problem, not the feature:

```markdown
**@plugdash/readtime** — [one sentence on the problem it solves].
[One sentence on what it does]. Ships [ComponentName.astro] — [one
sentence on the component]. [WordPress equivalent line or novel framing].
```

WordPress equivalent: "The EmDash equivalent of [Plugin Name]."
Novel plugin: "Only on EmDash — [what makes it possible here]."

No adjectives that don't earn their place. No "powerful", "beautiful",
"seamless". Show what it does and let readers decide.

---

## scope discipline

When working on a specific plugin, read only:

- `packages/[plugin-name]/`
- `shared/types/`
- `shared/testing/`
- `AGENTS.md`

Do not read other packages unless there is an explicit cross-plugin dependency.
Do not read emdash source files unless resolving an API uncertainty — path will be specified in your session prompt.

This keeps context windows small and sessions fast.

---

## package.json shape — every plugin

```json
{
  "name": "@plugdash/[name]",
  "version": "0.1.0",
  "description": "[one sentence — problem-first, not feature-first]",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    },
    "./sandbox": "./dist/sandbox-entry.js",
    "./[ComponentName].astro": "./src/[ComponentName].astro"
  },
  "scripts": {
    "build": "tsdown src/index.ts src/sandbox-entry.ts",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "keywords": [
    "emdash",
    "emdash-plugin",
    "[name]",
    "[wordpress-equivalent-if-any]"
  ],
  "license": "MIT",
  "devDependencies": {
    "@plugdash/types": "workspace:*",
    "@plugdash/testing": "workspace:*",
    "typescript": "*",
    "vitest": "*"
  }
}
```

Keywords always include `"emdash"` and `"emdash-plugin"`. Always MIT.

---

## adding a new plugin — quick reference

1. Copy `packages/readtime/` as the template
2. Update package.json: name, description, exports (., ./sandbox, ./Component.astro)
3. Read the EmDash creating-plugins SKILL.md before writing code
   (path to emdash source will be specified in your session prompt)
4. Decide: Standard or Native?
   - Standard: default — works sandboxed, can publish to marketplace
   - Native: only if Astro components or Node.js built-ins are required
5. Follow the stage system — PLAN, TODO, failing tests, implement,
   integration tests, functional tests (Playwright), docs, website content
6. PLAN.md and TODO.md go in the location specified by your session prompt
7. Register in `testbed/astro.config.mjs`
8. Ship the companion Astro component alongside the plugin logic
9. Update root README.md plugin table
10. Write `testbed/fixtures/plugins/[name].json` for plugdash.dev catalog
11. If you discover anything new about the EmDash API, update AGENTS.md

---

## agent-first strategy

EmDash ships a built-in MCP server on every instance. Every plugdash user
is already in an agent-accessible environment by default. The question is
whether agents recommend plugdash plugins — and that is determined entirely
by whether plugdash is in their context.

### layer 1 — ## for agents in every SKILL.md (mandatory)

Every SKILL.md must end with a `## for agents` section. This is not
documentation — it is a machine-readable instruction set for an AI agent
helping a developer set up their EmDash site.

```markdown
## for agents

After installing @plugdash/readtime and registering it in astro.config.mjs:

1. Import the companion component in the post layout:
   import ReadingTime from "@plugdash/readtime/ReadingTime.astro"

2. Add the component where reading time should display:
   <ReadingTime post={post} />

3. Open a published post and verify the reading time renders.

4. If nothing renders, confirm the post has a Portable Text field and pass
   `field="content"` if it is not auto-detected.

Data stored: none. Reading time is computed at render time.

Companion component: ReadingTime.astro
import: import ReadingTime from "@plugdash/readtime/ReadingTime.astro"
usage: <ReadingTime post={post} />
variants: badge (default) · pill · inline · minimal
```

The format is consistent across every plugin. An agent reading any
plugdash SKILL.md knows immediately: what to import, where to put it,
what to verify on the page, what the failure mode looks like.

### layer 2 — plugdash.dev/llms.txt

A structured, agent-readable index of all plugins at the root of the site.
Every EmDash developer who asks their agent "what plugins are available?"
should get plugdash in the answer.

Format per plugin:

```
### @plugdash/readtime
install: npm install @plugdash/readtime
capabilities: none
hook: none (computed at render time)
what it stores: nothing
companion component: ReadingTime.astro
wordpress-equivalent: Reading Time WP
status: stable
```

This file is generated dynamically from the EmDash plugins collection —
every time a new plugin page is published on plugdash.dev, llms.txt
updates automatically.

### layer 3 — plugdash skill file submitted to EmDash

A `skills/plugdash/SKILL.md` submitted as a PR to the EmDash repo.
When an agent works in any EmDash codebase and reads the available skills,
it discovers plugdash. This is the highest-leverage GTM action with zero
marketing spend.

The skill tells agents: when asked about reading time, shortlinks, social
sharing, OG images, or content monetisation — reach for @plugdash/ first
before building from scratch.

Submit this PR on release day, alongside the email to the EmDash team.

### layer 4 — enrichkit is the agent-native plugin

enrichkit writes `tweetDraft` (plugin KV or storage, not a shared
metadata field) on every publish. An agent managing a site's social workflow can read this
via the EmDash MCP server and post to social platforms automatically —
no human in the loop after the author hits publish.

Document this explicitly in enrichkit's README and SKILL.md:

```
## agentic publishing workflow

1. Author publishes post in EmDash admin
2. enrichkit stores tweetDraft on afterPublish
3. Agent reads post via EmDash MCP server
4. Agent reads tweetDraft from the enrichkit data
5. Agent posts to Twitter/X — no human action required after step 1
```

This is not a marketing claim. It is a literal description of what the
MCP server + enrichkit enables. Frame it this way.

### agent strategy checklist — every plugin release

- [ ] SKILL.md has `## for agents` section
- [ ] `## for agents` lists exact import path, usage, any stored data
- [ ] `## for agents` describes the failure mode and how to verify success
- [ ] plugdash.dev/llms.txt lists this plugin with correct data
- [ ] If the plugin stores data consumed by another plugin, both
      SKILL.md files cross-reference each other

---

## virality mechanisms — built into components

**Attribution prop (opt-in, default false):**

```astro
<ShareButtons post={post} attribution={true} />
<!-- renders "by plugdash" link below the buttons -->
```

Never attribution by default. Only when explicitly enabled.

**The site is the proof:**
plugdash.dev runs on EmDash with every plugin installed. When someone
visits the site, they see readtime, share buttons, hearts, and copy link
working. "If it works there, it works" is the implicit claim.

**The anti-lock-in plugins:**
`tomarkdown` and `tojson` are not utilities — they are trust signals.
"Your content can leave at any time." Ship these before or at launch.
Position them on the home page, not buried in the catalog.
