# @plugdash/readtime

Most sites either skip reading time or store it in a database field that goes stale.
This package works it out from the post body each time the page renders, so there is nothing to store or keep in sync.
Ships `ReadingTime.astro`, a drop-in label for "6 min read". The EmDash equivalent of [Reading Time WP](https://wordpress.org/plugins/reading-time-wp/).

## Install

```bash
pnpm add @plugdash/readtime
```

No plugin registration is needed. Import the component and pass the post:

```astro
---
import ReadingTime from "@plugdash/readtime/ReadingTime.astro";
---

<ReadingTime post={post} />
```

`readtimePlugin()` is still exported so old `astro.config.mjs` files keep working. It does nothing and is deprecated: remove it. Its `wordsPerMinute` and `collections` options are ignored; pass `wordsPerMinute` to the component instead.

## Props

| Prop             | Type                                         | Default      | Description                                                         |
| ---------------- | -------------------------------------------- | ------------ | ------------------------------------------------------------------- |
| `post`           | EmDash entry                                 | required     | The entry from `getEmDashEntry()`                                   |
| `wordsPerMinute` | `number`                                     | `238`        | Reading speed for space-separated scripts                           |
| `field`          | `string`                                     | auto         | Portable Text field name. Auto: `content`, then `body`, then the first Portable Text array in `data` |
| `label`          | `string`                                     | `"min read"` | Text after the number                                               |
| `variant`        | `"badge" \| "pill" \| "inline" \| "minimal"` | `"inline"`   | Look of the label                                                   |
| `size`           | `"sm" \| "md" \| "lg"`                       | `"md"`       | Font size                                                           |
| `theme`          | `"auto" \| "dark" \| "light"`                | `"auto"`     | Colour scheme                                                       |
| `showWords`      | `boolean`                                    | `false`      | Also show the word count                                            |
| `attribution`    | `boolean`                                    | `false`      | Show a small "plugdash" link                                        |
| `class`          | `string`                                     | -            | Extra CSS class                                                     |

Style it with `--plugdash-rt-color`, `--plugdash-rt-size`, `--plugdash-rt-font`, `--plugdash-rt-bg`, `--plugdash-rt-border`, `--plugdash-rt-radius` and `--plugdash-rt-padding`.

The component renders nothing when the post has no body.

## Use it in code

```ts
import { getReadingTime } from "@plugdash/readtime/utils";

const { minutes, wordCount } = getReadingTime(post, { wordsPerMinute: 200 });
```

`getReadingTime` also accepts a Portable Text array. Options: `wordsPerMinute`, `cjkCharsPerMinute` (default 500), `field`.

## Replacing the blog template's reading time

The blog template computes its own reading time in `src/pages/posts/[slug].astro` with `getReadingTime(post.data.content)` and prints `{readingTime} min read`. To use this component instead, import it and swap the span:

```astro
<!-- before -->
<span>{readingTime} min read</span>
<!-- after -->
<ReadingTime post={post} />
```

## How it counts

- Words in text blocks, plus the `title` and `body` of `callout` nodes
- Code blocks, images and embeds are not counted
- Han, Hangul, Hiragana and Katakana characters are counted one by one at 500 per minute. Other scripts, including Devanagari, count as space-separated words
- `minutes = max(1, ceil(words / wordsPerMinute + cjkChars / 500))`

## What it does not do

- No hooks, no stored data, no `metadata` writes
- No per-post speed override
- Posts written by an older readtime that have `data.metadata.readingTimeMinutes` and no body still show that stored value
