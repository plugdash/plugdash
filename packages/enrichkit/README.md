# @plugdash/enrichkit

**@plugdash/enrichkit** - writing a summary, tags and a tweet for every post is the chore nobody does. On publish it makes one LLM call and stores a summary, topics, tags, a reading level and a tweet draft, and fills an empty SEO description with the summary. Only on EmDash - the result sits next to the post, ready for an agent on the EmDash MCP server to pick up.

## What it costs

Enrichkit is built to call the provider as rarely as possible:

- **Publish only.** It listens to `content:afterPublish`. Autosaves and draft saves never call the provider, even on a post that is already live.
- **Unchanged content is free.** Each result stores a SHA-256 hash of the model, the enrichment flags, the title and the body text. Republishing the same text skips the call.
- **One call, no retries.** The reply is structured output (a forced tool call on Anthropic, a strict JSON schema on OpenAI). If the reply still can't be read, a 429 comes back, or the request times out, it logs once and stops. The next changed publish tries again.
- **Short posts are skipped.** Under 100 words, no call.
- **Body is capped** at 12,000 characters.

With the default `claude-haiku-4-5`, a typical post costs well under a cent per changed publish.

## Install

```bash
pnpm add @plugdash/enrichkit
```

```js
// astro.config.mjs
import { defineConfig } from "astro/config";
import emdash from "emdash/astro";
import { enrichkitPlugin } from "@plugdash/enrichkit";

export default defineConfig({
	integrations: [
		emdash({
			plugins: [enrichkitPlugin({ provider: "anthropic" })],
		}),
	],
});
```

## Set the API key

The key is an encrypted plugin setting, so it never lands in your build output.

1. Generate an encryption key and set `EMDASH_ENCRYPTION_KEY` in the server's process environment. Export it in the shell that runs `astro dev` or `node dist/server/entry.mjs` (on Cloudflare, add it as a Worker secret). A `.env` file alone was not picked up by `astro dev` in testing.

   ```bash
   pnpm exec emdash secrets generate
   ```

   Without it, saving the key fails with `PLUGIN_SETTING_ENCRYPTION_KEY_MISSING`.

2. In the admin, open **Plugins > enrichkit > Settings** and paste your Anthropic or OpenAI key into **API key**.

You can also pass `apiKey` in the options. That works, but the key ends up in plain text in the build, and enrichkit logs a one-time warning recommending the admin setting. A key in the admin wins over the option.

## Where results go

- **KV `result:<entry id>`**, one row per entry: `{ summary, topics, tags, readingLevel, tweet, model, generatedAt, hash }` plus `collection` and `title`. Only enabled fields are present.
- **`seo.description`**, when `writeSeoDescription` is on and the description is empty. This is a seo-only update, so it goes live right away without creating a draft. An author's own description is never overwritten. Collections without SEO are skipped.
- **The admin page** at **Plugins > Enrichkit** shows the latest result for each enriched entry, with a **Regenerate** button that forces one new call.

## Options

| Option                     | Type                      | Default                                                    | Description                                          |
| -------------------------- | ------------------------- | ---------------------------------------------------------- | ---------------------------------------------------- |
| `provider`                 | `"anthropic" \| "openai"` | `"anthropic"`                                              | Which API to call. Also sets `allowedHosts`.         |
| `model`                    | `string`                  | `claude-haiku-4-5` / `gpt-4o-mini`                         | Model id                                             |
| `enrichments.summary`      | `boolean`                 | `true`                                                     | 2-3 sentence summary                                 |
| `enrichments.keyTopics`    | `boolean`                 | `true`                                                     | 3-5 topics                                           |
| `enrichments.autoTags`     | `boolean`                 | `true`                                                     | 3-8 lowercase tags                                   |
| `enrichments.readingLevel` | `boolean`                 | `false`                                                    | Estimated grade level                                |
| `enrichments.tweetDraft`   | `boolean`                 | `true`                                                     | Tweet under 280 characters (longer ones are dropped) |
| `field`                    | `string`                  | `content`, then `body`, then the first Portable Text field | Which field holds the body                           |
| `writeSeoDescription`      | `boolean`                 | `true`                                                     | Fill an empty `seo.description` with the summary     |
| `timeoutMs`                | `number`                  | `30000`                                                    | Abort the provider request after this long           |
| `apiKey`                   | `string`                  | none                                                       | Fallback key. Prefer the admin setting.              |

## Troubleshooting

All log lines are under the `enrichkit` plugin.

- `calling provider` - one line per paid call. Count these to see what you are spending.
- `content unchanged since last enrichment, skipping` - the hash matched, no call.
- `host api.anthropic.com not in allowedHosts; set provider in astro.config.mjs or add it to allowedHosts` - the `provider` option doesn't match the API it is calling.
- `no API key: ...` - set the key as described above.

## What it does not do

- Does not run on autosave, draft save, schedule or unpublish.
- Does not retry. Not on a bad reply, not on 429, not on timeout.
- Does not write to `data.metadata` (0.1.x did). Read results from KV or from `seo.description`.
- Does not fail a publish. Every failure is logged and skipped.

## License

MIT
