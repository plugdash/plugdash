# @plugdash/enrichkit

AI enrichment for publishers who don't want to think about prompts. One LLM call on publish adds a summary, key topics, auto-tags, a reading level estimate, and a tweet draft to post metadata - configure which enrichments you need.

## Install

```bash
pnpm add @plugdash/enrichkit
```

## Register

```js
// astro.config.mjs
import { defineConfig } from "astro/config";
import emdash from "emdash";
import { enrichkitPlugin } from "@plugdash/enrichkit";

export default defineConfig({
  integrations: [
    emdash({
      plugins: [
        enrichkitPlugin({
          provider: "anthropic",
          apiKey: process.env.ANTHROPIC_API_KEY,
        }),
      ],
    }),
  ],
});
```

The API key can also be left out at build time and set later from the admin UI at `/_emdash/admin/plugins/enrichkit/settings`.

## Config options

| Option                    | Type      | Default             | Description                                  |
| -------------------------- | --------- | -------------------- | --------------------------------------------- |
| provider                   | `"anthropic" \| "openai"` | required | Which LLM API to call |
| apiKey                     | `string`  | required             | API key for the chosen provider              |
| model                      | `string`  | provider default     | `claude-haiku-4-5` (Anthropic) or `gpt-4o-mini` (OpenAI) |
| enrichments.summary        | `boolean` | `true`                | 2-3 sentence summary of the main argument     |
| enrichments.keyTopics      | `boolean` | `true`                | 3-5 main topics as short noun phrases         |
| enrichments.readingLevel   | `boolean` | `false`               | Estimated grade level (e.g. "Grade 8")        |
| enrichments.autoTags       | `boolean` | `true`                | 3-8 lowercase, hyphenated discovery tags      |
| enrichments.tweetDraft     | `boolean` | `true`                | Tweet draft under 280 characters              |

## Before / after

**Before publish** - a plain post with no metadata beyond title and body.

**After publish** - `post.data.metadata.enrichkit`:

```json
{
  "summary": "A look at how static sites evolved from plain HTML to full content platforms, and what that means for publishers choosing a stack today.",
  "keyTopics": ["static site generators", "content management", "web performance"],
  "autoTags": ["ssg", "cms", "performance", "web-dev"],
  "tweetDraft": "Static sites grew up. Here's what changed and why it matters for your next project.",
  "generatedAt": "2026-04-01T12:00:00Z",
  "model": "claude-haiku-4-5"
}
```

`readingLevel` is off by default; enable it to also get a `"Grade 10"`-style estimate.

## Metadata written

On publish, writes to `post.data.metadata.enrichkit`:

```typescript
{
  summary?: string
  keyTopics?: string[]
  readingLevel?: string
  autoTags?: string[]
  tweetDraft?: string
  generatedAt: string  // ISO 8601
  model: string
}
```

Only enabled, successfully-validated fields are included - a field the model omitted or returned in the wrong shape is left out rather than written as `null` or an empty value.

## What it does

- Fires on `content:afterSave` when status is `published`
- Skips content under 100 words - short posts aren't worth the API call
- Extracts plain text from the Portable Text body and builds one prompt covering every enabled enrichment
- Calls the configured provider (Anthropic Messages API or OpenAI Chat Completions) with a 20 second timeout
- Parses the JSON response and validates each field's type; retries once if the JSON is unusable
- Merges the result into existing content metadata (read-merge-write), so other plugins' metadata is preserved
- Logs the fields written and the token count on success

## What it does not do

- Does not fail a publish for any enrichment failure - missing key, timeout, rate limit, invalid JSON, or quota error all just skip and log
- Does not retry synchronously on a rate limit (HTTP 429) - waits for the next publish instead
- Does not truncate an over-length tweet draft - drops it, since a tweet cut mid-word is worse than none
- Does not enrich drafts, archived, or scheduled content
- Does not call the provider more than twice per publish (one attempt, one retry on invalid JSON)
- Does not render the stored API key back into the admin UI - shows a masked hint (`sk-t...1234`) and only overwrites the key when a new non-empty value is submitted
- Does not support custom prompts - the prompt template is fixed per the enabled enrichment fields

## vrk / vrksh integration

If your build environment already has the [vrk](https://vrksh.dev) CLI wired up for LLM calls, enrichkit's provider call is isolated in one function (`callModel` in `sandbox-entry.ts`, backed by the pure `buildRequest`/`extractCompletion` helpers in `enrich-logic.ts`) so it can be swapped for a `vrk prompt --model claude-haiku-4-5 --json` pipe instead of calling the Anthropic/OpenAI API directly. Not wired up out of the box - flagged here for teams who want to fork it.
