---
name: enrichkit
description: AI enrichment plugin for EmDash. On publish, one LLM call adds a summary, topics, tags, reading level and a tweet draft, skipped when the content is unchanged.
---

# skill: enrichkit

## what it does

On publish, makes one structured-output LLM call and stores a summary, topics, tags, reading level and tweet draft in plugin KV. Fills an empty `seo.description` with the summary, and skips the call when the title and body have not changed.

## plugin type

Native

## capabilities declared

```
content:read
content:write
network:request
```

`allowedHosts` is the configured provider's host only (`api.anthropic.com` or `api.openai.com`).

## hooks

- `content:afterPublish` - runs on publish only (timeout `timeoutMs + 5000`). There is no `afterSave` hook, so autosaves never cost anything.

## install

pnpm add @plugdash/enrichkit

## register

```js
// astro.config.mjs
import emdash from "emdash/astro";
import { enrichkitPlugin } from "@plugdash/enrichkit";

emdash({ plugins: [enrichkitPlugin({ provider: "anthropic" })] });
```

Then set the `apiKey` secret under Plugins > enrichkit > Settings. This needs `EMDASH_ENCRYPTION_KEY` on the server (`pnpm exec emdash secrets generate`); without it the save fails with `PLUGIN_SETTING_ENCRYPTION_KEY_MISSING`.

## companion component

None. Results show in the admin page (Plugins > Enrichkit) with a Regenerate button, and the summary reaches the page through `seo.description`.

## configuration

| option              | type                      | default                                     | description                           |
| ------------------- | ------------------------- | ------------------------------------------- | ------------------------------------- |
| provider            | `"anthropic" \| "openai"` | `"anthropic"`                               | API to call                           |
| model               | `string`                  | `claude-haiku-4-5` / `gpt-4o-mini`          | model id                              |
| enrichments         | `object`                  | summary, keyTopics, autoTags, tweetDraft on | which fields to generate              |
| field               | `string`                  | content, body, first PT field               | body field                            |
| writeSeoDescription | `boolean`                 | `true`                                      | fill empty seo.description            |
| timeoutMs           | `number`                  | `30000`                                     | request timeout                       |
| apiKey              | `string`                  | none                                        | fallback key; prefer the admin secret |

## what it does not do

- No call on autosave, draft save, or unchanged republish
- No retries (bad reply, 429, timeout all log once and stop)
- Does not write `data.metadata`
- Never overwrites an author's `seo.description`
- Never fails a publish

## for agents

After installing @plugdash/enrichkit and registering it:

1. Make sure `EMDASH_ENCRYPTION_KEY` is set, then set the `apiKey` secret in Plugins > enrichkit > Settings.
2. Publish a post with at least 100 words of body text.
3. Verify: the log shows one `calling provider` line and then `enriched`; the admin page Plugins > Enrichkit lists the post; `seo.description` is filled if it was empty.
4. If nothing happens: check for `no API key`, `content too short to enrich`, `content unchanged since last enrichment` or a `host ... not in allowedHosts` line in the log.

Results written:
KV `result:<entry id>` - `{ summary?, topics?, tags?, readingLevel?, tweet?, model, generatedAt, hash, collection, title }`
`seo.description` - the summary, only when it was empty

Companion component: none
