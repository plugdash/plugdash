# plugdash

Plugin catalog for EmDash (emdashcms.com). pnpm monorepo. MIT license.
All packages published to npm under @plugdash/.

## what this is

Quality plugins for EmDash. Each plugin uses EmDash's definePlugin() API
with explicit capability declarations. No thin API wrappers — every plugin
owns its logic.

## toolchain

- pnpm workspaces (not npm, not yarn)
- tsdown for builds
- vitest for tests
- oxlint + oxfmt for lint and format (tabs, not spaces)
- changesets for independent per-package versioning

## adding a new plugin

Copy packages/readtime as the template. Every plugin needs:
- src/index.ts — the definePlugin() export
- tests/index.test.ts — tests using shared/testing mock context
- SKILL.md — agent-readable description (see skills/creating-plugins/SKILL.md)
- package.json — name @plugdash/[name], keywords ["emdash", "emdash-plugin"]

## content is Portable Text

EmDash stores content as Portable Text (structured JSON arrays), not HTML.
Never strip HTML tags. Traverse Portable Text nodes instead:

  import type { PortableTextBlock } from "@portabletext/types";

  function extractText(blocks: PortableTextBlock[]): string {
    return blocks
      .filter((b) => b._type === "block")
      .flatMap((b) => b.children ?? [])
      .filter((c) => c._type === "span")
      .map((c) => c.text ?? "")
      .join(" ");
  }

## rules

- Never call os.exit() inside a plugin. Return values only.
- Errors go to ctx.log.error(). Never throw to the host.
- Always handle the case where a capability context is undefined.
- shared/types and shared/testing are devDependencies only — never runtime deps.
- Ship SKILL.md with every plugin.
- Never build a plugin that is purely a thin wrapper around a third-party API.

## confirmed API facts (verified — supersede any spec)

- write:metadata does not exist. Always use write:content.
- ctx.content.update() takes 3 args: (collection, id, data).
- update() is column-level: each data field is its own DB column.
  Sending { metadata: X } only touches metadata column — body is safe.
  But metadata column is fully replaced — always read-merge-write it:
    const existing = await ctx.content.get(collection, id)
    const existingMeta = isRecord(existing?.data?.metadata) ? existing.data.metadata : {}
    await ctx.content.update(collection, id, { metadata: { ...existingMeta, ...newFields } })
- event.content fields: system fields (status, id, slug) are top-level.
  Custom fields (body, metadata) are under event.content.data.
  Always use event.content.data.body and event.content.data.metadata.
- Standard plugins cannot read descriptor options at runtime.
  Use KV-based config seeded via plugin:install hook.
- Every Standard plugin requires two files:
    src/index.ts          descriptor factory (Vite build time)
    src/sandbox-entry.ts  definePlugin() with hooks (request time)
  package.json must export both as "." and "./sandbox".
- isRecord() is in shared/types/src/index.ts — import it, never rewrite it.

## scope discipline

When working on a specific plugin, read only:
- packages/[plugin-name]/
- shared/types/
- shared/testing/
- AGENTS.md

Do not read other packages unless there is an explicit cross-plugin dependency.
This keeps context windows small and sessions fast.