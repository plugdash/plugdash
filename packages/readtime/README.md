# @plugdash/readtime

Word count and reading time for EmDash content.
Writes `readingTimeMinutes` and `wordCount` to post metadata on publish.
The EmDash equivalent of [Reading Time WP](https://wordpress.org/plugins/reading-time-wp/).

## Install

```bash
pnpm add @plugdash/readtime
```

## Register

```js
// astro.config.mjs
import { defineConfig } from "astro/config";
import emdash from "emdash";
import { readtimePlugin } from "@plugdash/readtime";

export default defineConfig({
  integrations: [
    emdash({
      plugins: [readtimePlugin()],
      // or sandboxed: [readtimePlugin()]
    }),
  ],
});
```

## Configuration

### Admin dashboard

After installing, open the EmDash admin and go to Plugins - Reading Time
- Settings. All configuration options are available there. Changes take
effect on the next publish - no code changes required.

### astro.config.mjs

Pass config at register time. Values are seeded into KV on install and
reseeded automatically when the config in code changes.

```js
readtimePlugin({
  wordsPerMinute: 250,
  collections: ["blog", "articles"],
});
```

| Option           | Type       | Default | Description                                       |
| ---------------- | ---------- | ------- | ------------------------------------------------- |
| wordsPerMinute   | `number`   | `238`   | Average reading speed used for the calculation    |
| collections      | `string[]` | all     | Limit processing to specific collection slugs     |

**Set `collections` whenever your site has collections without a
`metadata` field** (e.g. EmDash's built-in `plugins` collection).
Without an allowlist, readtime tries to write metadata on every content
save and will log (but not throw) a "no such column: metadata" error
when the target collection lacks one.

## Astro theme usage

Access reading time values from the content metadata in your Astro templates:

```astro
---
const post = await emdash.content.get("posts", Astro.params.id);
const { wordCount, readingTimeMinutes } = post.data.metadata ?? {};
---

{readingTimeMinutes && <span>{readingTimeMinutes} min read</span>}
{wordCount && <span>{wordCount.toLocaleString()} words</span>}
```

## What it does

- Ships `ReadingTime.astro` - drop-in companion component with four variants
- Fires on `content:afterSave` when status is `published`
- Extracts plain text from Portable Text body blocks
- Counts words (splits on whitespace)
- Calculates reading time with a configurable WPM rate
- Writes `wordCount` and `readingTimeMinutes` to content metadata
- Preserves existing metadata keys from other plugins

## What it does not do

- Does not calculate reading time for drafts, archived, or scheduled content
- Does not count words in images, embeds, or other non-text block types
- Does not provide server-side rendering of the component - it is a client Astro component
- Does not support per-post WPM overrides
- Does not account for code blocks or block quotes differently
