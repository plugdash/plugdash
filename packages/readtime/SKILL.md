---
name: readtime
description: Word count and reading time plugin for EmDash. Writes readingTimeMinutes and wordCount to content metadata on publish.
---

# @plugdash/readtime

Calculates word count and reading time for EmDash content on publish. Writes `wordCount` and `readingTimeMinutes` to the content's metadata field.

## Capabilities

```
read:content
write:content
```

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
    }),
  ],
});
```

## Config options

| Option           | Type       | Default | Description                                      |
| ---------------- | ---------- | ------- | ------------------------------------------------ |
| wordsPerMinute   | `number`   | `238`   | Average reading speed used for the calculation    |
| collections      | `string[]` | all     | Limit processing to specific collection slugs     |

## Astro theme usage

```astro
---
const post = await emdash.content.get("posts", Astro.params.id);
const { wordCount, readingTimeMinutes } = post.data.metadata ?? {};
---

{readingTimeMinutes && <span>{readingTimeMinutes} min read</span>}
```

## What it does not do

- Does not process drafts, archived, or scheduled content
- Does not count words in images, embeds, or non-text blocks
- Does not provide a frontend component
- Does not support per-post WPM overrides
- Does not differentiate code blocks or block quotes
