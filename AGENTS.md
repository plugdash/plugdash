# plugdash

Plugin catalog for EmDash (emdashcms.com). pnpm monorepo. MIT license.
All packages published to npm under @plugdash/.

---

## what this is

Quality plugins for EmDash. Each plugin uses EmDash's definePlugin() API
with explicit capability declarations. No thin API wrappers — every plugin
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
│       │   ├── sandbox-entry.ts   # definePlugin() with hooks
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

### capability names

`write:metadata` does not exist. Use `write:content` for any plugin that
calls `ctx.content.update()`. Confirmed capabilities that exist:
`read:content`, `write:content`, `read:media`,
`write:media`, `network:[hostname]`

// confirmed 2026-04-05 while building @plugdash/shortlink
`read:kv` and `write:kv` do not exist as capabilities. KV is auto-available
to all plugins without declaring any capability. ctx.kv is always present.
`write:routes` does not exist as a capability. Routes are declared in
definePlugin({ routes }) and need no capability declaration.

// confirmed 2026-04-05 while building @plugdash/heartpost
`routeCtx.input` for POST routes is pre-parsed JSON. The EmDash runtime
calls `await request.json()` in emdash-runtime.ts before invoking the
route handler. No JSON.parse() needed in the handler - cast directly:
`const { id } = routeCtx.input as Record<string, unknown>`
Verified in emdash-source/packages/core/src/emdash-runtime.ts lines 1793-1800.

### ctx.content.update() signature

Three arguments: `ctx.content.update(collection, id, data)`

```typescript
// wrong
await ctx.content.update(id, { metadata: merged });

// right
await ctx.content.update(collection, id, { metadata: merged });
```

### update() is column-level, not document-level

EmDash stores each data field as its own database column. Sending
`{ metadata: X }` updates only the metadata column — body and other
fields are untouched. But the metadata column itself is fully replaced.

Pattern: always read-merge-write the metadata object:

```typescript
const existing = await ctx.content.get(collection, id);
const existingData = isRecord(existing?.data) ? existing.data : {};
const existingMeta = isRecord(existingData.metadata)
  ? existingData.metadata
  : {};

await ctx.content.update(collection, id, {
  metadata: {
    ...existingMeta, // preserve other plugins' keys
    myNewField: value, // add/overwrite our keys
  },
});
```

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

`content:afterSave` receives:

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
event.content.data.body; // ✅ nested under data — Portable Text array
event.content.data.metadata; // ✅ nested under data — metadata object (read-merge-write)
event.content.data.[any]; // ✅ all user-defined fields live here

// Collection is on the event itself, not on content
event.collection; // ✅ on the event object

// Common mistakes
event.content.title; // ❌ WRONG — title is under data, not top level
event.content.body; // ❌ WRONG — does not exist at top level
event.content.metadata; // ❌ WRONG — does not exist at top level
```

// confirmed 2026-04-05 while building @plugdash/sharepost
`title` is a custom data field, not a system field. CLI reads `item.data?.title`,
repository reads `newData.title` where `newData = { ...original.data }`,
content handler tests create items with `data: { title: "Hello World" }`.
Every plugin that needs the post title must read `event.content.data.title`.

### standard plugins cannot access descriptor options at runtime

The `options` field on PluginDescriptor is native-format only. Standard
plugins read config from KV, seeded via `plugin:install` hook:

```typescript
// sandbox-entry.ts
async function getConfig(ctx: PluginContext) {
  const wordsPerMinute = (await ctx.kv.get<number>("config:wordsPerMinute")) ?? 238
  const collections = await ctx.kv.get<string[]>("config:collections")
  return { wordsPerMinute, collections }
}

// plugin:install hook seeds defaults
"plugin:install": {
  handler: async (_event, ctx) => {
    await ctx.kv.set("config:wordsPerMinute", 238)
  }
}
```

### two-file plugin structure is required for standard plugins

Every Standard plugin requires two files:

```
src/index.ts          → PluginDescriptor factory (Vite build time)
src/sandbox-entry.ts  → definePlugin() with hooks (request time)
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

Declare the network capability: `"network:api.example.com"`

### isRecord() lives in shared/types

```typescript
import { isRecord } from "@plugdash/types";

// use before accessing event.content.data or existingData.metadata
if (!isRecord(event.content.data)) return;
```

Never rewrite this utility. Import it.

---

## what agents get wrong in this repo — known failure modes

**1. Proceeding past a stage gate without stopping**
The stage system exists for approval checkpoints. Stop and wait.
If you move from Stage 1 to Stage 2 without approval, stop, revert, and stop.

**2. Writing event.content.body instead of event.content.data.body**
The most common mistake. Body is nested under data. Always.

**3. Using write:metadata as a capability**
Does not exist. Always write:content.

**4. Two-arg ctx.content.update(id, data)**
Always three args: (collection, id, data).

**5. Using global fetch() in sandbox-entry.ts**
Use ctx.http.fetch(). Global fetch is silently blocked in Workers isolates.

**6. Writing PLAN.md or TODO.md into packages/**
Planning files (PLAN.md, TODO.md) go outside this repo in the location specified by your session prompt. Never in the monorepo.

**7. Skipping the plugin:install hook**
Standard plugins with config must seed KV defaults via plugin:install.
Without this, getConfig() returns null for everything and defaults apply —
but the admin Block Kit page won't show current values correctly.

**8. Forgetting to export the Astro component in package.json**
Astro components are not compiled by tsdown. They export from src/, not dist/.
The exports field must explicitly list each .astro file.

**9. Replacing full metadata instead of merging**
Sending { metadata: { myField: value } } without spreading existingMeta
silently destroys keys written by other plugins.

**10. Using spaces instead of tabs**
oxfmt uses tabs. Any file with spaces will fail formatting check.
Run `pnpm format` to fix before committing.

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
Write e2e/[name].spec.ts using Playwright.
Add fixture content to testbed/fixtures/seed.ts if needed.
Run: pnpm playwright test e2e/[name].spec.ts
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
Requires testbed running on localhost:4321

**Functional tests run before release (automated):**
Playwright against live testbed

---

## every plugin ships a UI component

This is non-negotiable. A plugin that writes metadata but ships no visual
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
await ctx.content.update(collection, id, { metadata: merged });
```

**Always check status before processing.**
First line of every content:afterSave handler:

```typescript
if (event.content.status !== "published") return;
```

**Always guard capability contexts.**

```typescript
if (!ctx.content) {
  ctx.log.error("readtime: content capability not available");
  return;
}
```

**Always merge metadata, never replace.**

```typescript
// wrong — destroys other plugins' keys
await ctx.content.update(collection, id, { metadata: { myKey: value } });

// right
const existing = await ctx.content.get(collection, id);
const existingMeta = isRecord(existing?.data?.metadata)
  ? existing.data.metadata
  : {};
await ctx.content.update(collection, id, {
  metadata: { ...existingMeta, myKey: value },
});
```

**Idempotency rule.**
Every plugin that creates records must be safe to run twice:

- Metadata enrichment (readtime, tocgen, enrichkit): overwrite is fine
- Record creation (shortlink, redirect, receipt): check existence first

**Config via KV, seeded at install.**
Standard plugins cannot access descriptor options at runtime.
Always use KV for config with hardcoded defaults as fallback.

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

3. Publish a test post and verify:
   post.data.metadata.readingTimeMinutes is populated (integer, min 1)
   post.data.metadata.wordCount is populated (integer)

4. If no value appears, confirm post status is "published" not "draft".

Metadata written:
post.data.metadata.readingTimeMinutes — integer, minimum 1
post.data.metadata.wordCount — integer

Companion component: ReadingTime.astro
import: import ReadingTime from "@plugdash/readtime/ReadingTime.astro"
usage: <ReadingTime post={post} />
variants: badge (default) · pill · inline · minimal
```

The format is consistent across every plugin. An agent reading any
plugdash SKILL.md knows immediately: what to import, where to put it,
what metadata to verify, what the failure mode looks like.

### layer 2 — plugdash.dev/llms.txt

A structured, agent-readable index of all plugins at the root of the site.
Every EmDash developer who asks their agent "what plugins are available?"
should get plugdash in the answer.

Format per plugin:

```
### @plugdash/readtime
install: npm install @plugdash/readtime
capabilities: read:content, write:content
hook: content:afterSave
what it writes: post.data.metadata.readingTimeMinutes, post.data.metadata.wordCount
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

enrichkit writes `tweetDraft` to `post.data.metadata.enrichkit.tweetDraft`
on every publish. An agent managing a site's social workflow can read this
via the EmDash MCP server and post to social platforms automatically —
no human in the loop after the author hits publish.

Document this explicitly in enrichkit's README and SKILL.md:

```
## agentic publishing workflow

1. Author publishes post in EmDash admin
2. enrichkit writes tweetDraft to post.data.metadata.enrichkit.tweetDraft
3. Agent reads post via EmDash MCP server
4. Agent reads tweetDraft from metadata
5. Agent posts to Twitter/X — no human action required after step 1
```

This is not a marketing claim. It is a literal description of what the
MCP server + enrichkit enables. Frame it this way.

### agent strategy checklist — every plugin release

- [ ] SKILL.md has `## for agents` section
- [ ] `## for agents` lists exact import path, usage, metadata fields written
- [ ] `## for agents` describes the failure mode and how to verify success
- [ ] plugdash.dev/llms.txt lists this plugin with correct metadata
- [ ] If the plugin writes metadata consumed by another plugin, both
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
