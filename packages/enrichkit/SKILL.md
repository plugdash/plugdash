---
name: enrichkit
description: AI enrichment plugin for EmDash. Adds a summary, key topics, auto-tags, reading level, and a tweet draft to content metadata on publish via one LLM call.
---

# @plugdash/enrichkit

Enriches published EmDash content with AI-generated metadata: a summary, key topics, auto-tags, a reading level estimate, and a draft tweet. One configurable LLM API call per publish. Choose which enrichments to run.

## Plugin type

Standard

## Capabilities declared

```
content:read
content:write
network:request
```

`allowedHosts` is narrowed to the configured provider's API host (`api.anthropic.com` or `api.openai.com`). With no provider configured yet, both hosts are allowed until the admin page sets one.

## Hooks

- `plugin:install` - seeds default enrichment flags to KV (and the provider/key/model when build-time config is given)
- `content:afterSave` - runs the enrichment call on publish, merges results into content metadata

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

The API key can also be left unset at build time and configured later from the admin page - either way it is only ever read from KV at request time, never rendered back into the UI.

## Configuration

| Option                    | Type      | Default             | Description                                  |
| -------------------------- | --------- | -------------------- | --------------------------------------------- |
| provider                   | `"anthropic" \| "openai"` | required | Which LLM API to call |
| apiKey                     | `string`  | required             | API key for the chosen provider              |
| model                      | `string`  | provider default (`claude-haiku-4-5` / `gpt-4o-mini`) | Model id |
| enrichments.summary        | `boolean` | `true`                | 2-3 sentence summary of the main argument     |
| enrichments.keyTopics      | `boolean` | `true`                | 3-5 main topics as short noun phrases         |
| enrichments.readingLevel   | `boolean` | `false`               | Estimated grade level                         |
| enrichments.autoTags       | `boolean` | `true`                | 3-8 lowercase, hyphenated discovery tags      |
| enrichments.tweetDraft     | `boolean` | `true`                | Tweet draft under 280 characters              |

All settings can also be changed from the admin page at `/_emdash/admin/plugins/enrichkit/settings`.

## What it does

- Fires on `content:afterSave` when status is `published`
- Skips content under 100 words - not worth the API call
- Extracts plain text from the Portable Text body and builds one prompt covering every enabled enrichment
- Calls the configured provider's chat/completion endpoint with an `AbortController` timeout
- Parses the JSON response, validates each field's type, and retries once if the JSON is unusable
- Writes the result to `content.data.metadata.enrichkit` (read-merge-write, so other plugins' metadata is preserved)
- Logs the fields written and the token count on success

## What it does not do

- Does not fail a publish for any enrichment failure - a missing key, a timeout, a rate limit, an invalid response, or a quota error all just skip and log
- Does not retry synchronously on a rate limit (429) - the next publish gets a fresh attempt
- Does not truncate an over-length tweet draft - drops it instead, since a tweet cut mid-word is worse than no tweet
- Does not enrich drafts, archived, or scheduled content
- Does not call the provider more than twice per publish (one attempt plus one retry on invalid JSON)
- Does not render the stored API key back into the admin UI - the form shows a masked hint and only overwrites the key when a new non-empty value is submitted

## vrk / vrksh integration

If your site's build environment has the [vrk](https://vrksh.dev) CLI available, you can swap the built-in provider call for a `vrk prompt` pipe instead of configuring `apiKey` directly - useful for developers already routing their LLM calls through vrksh. This is not wired up in the plugin itself; it is a note for teams who want to fork `enrich-logic.ts`'s `buildRequest`/`callModel` split to shell out to `vrk prompt --model claude-haiku-4-5 --json` instead of calling the provider API directly.

## For agents

After installing @plugdash/enrichkit and registering it in astro.config.mjs:

1. Set an API key, either at build time via the `apiKey` option (read from an env var) or later from the admin page.
2. Publish a test post with at least 100 words of body text.
3. Verify `post.data.metadata.enrichkit` is populated:
   - `summary` - string
   - `keyTopics` - array of strings (if enabled)
   - `readingLevel` - string (if enabled, off by default)
   - `autoTags` - array of lowercase, hyphenated strings (if enabled)
   - `tweetDraft` - string under 280 characters (if enabled)
   - `generatedAt` - ISO timestamp
   - `model` - the model id used

4. If no `enrichkit` metadata appears, confirm:
   - Post status is "published" (not draft)
   - The post body has at least 100 words
   - An API key is configured (check plugin logs for "apiKey not configured")
   - The post was saved after the plugin was installed or reconfigured

Metadata written:
- `post.data.metadata.enrichkit.summary` - string
- `post.data.metadata.enrichkit.keyTopics` - string array
- `post.data.metadata.enrichkit.autoTags` - string array, lowercase, hyphenated
- `post.data.metadata.enrichkit.tweetDraft` - string, max 280 chars
- `post.data.metadata.enrichkit.generatedAt` - ISO 8601 timestamp
- `post.data.metadata.enrichkit.model` - string
