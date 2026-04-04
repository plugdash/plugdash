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

## Companion component

Exported as `@plugdash/readtime/ReadingTime.astro`.

Variants: `badge` (default) / `pill` / `inline` / `minimal`
Sizes: `sm` / `md` (default) / `lg`
Theme: `auto` (default) / `dark` / `light`

Renders nothing when `readingTimeMinutes` is not present.

## What it does not do

- Does not process drafts, archived, or scheduled content
- Does not count words in images, embeds, or non-text blocks
- Does not support per-post WPM overrides
- Does not differentiate code blocks or block quotes

## For agents

After installing @plugdash/readtime and registering it in astro.config.mjs:

1. Import ReadingTime in the post layout:
   ```
   import ReadingTime from "@plugdash/readtime/ReadingTime.astro"
   ```

2. Add the component where reading time should display:
   ```
   <ReadingTime post={post} />
   ```
   Common placements: below post title, in post header meta, in post card.

3. Optionally add CSS overrides to global.css:
   ```
   :root { --plugdash-rt-color: var(--muted); }
   ```

4. Publish a test post and verify it shows the reading time label.
   If no label appears, confirm the post status is "published" (not draft).

Metadata written by this plugin:
- `post.data.metadata.readingTimeMinutes` - integer, minimum 1
- `post.data.metadata.wordCount` - integer
