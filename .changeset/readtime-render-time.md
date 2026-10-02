---
"@plugdash/readtime": minor
---

Compute reading time in ReadingTime.astro at render time. No hooks, no metadata writes, no plugin registration needed. Adds wordsPerMinute and field props, counts callout text and CJK characters, and drops the sandbox entry and admin page.

Breaking: `data.metadata.readingTimeMinutes` and `data.metadata.wordCount` are no longer written, and the `./sandbox` export and admin page are removed. To upgrade, remove `readtimePlugin()` from `plugins` or `sandboxed` in astro.config.mjs (it is now a deprecated no-op), pass `wordsPerMinute` to `<ReadingTime>` instead of the plugin, and replace any template code that reads the metadata fields with `<ReadingTime post={post} />` or `getReadingTime(post)` from `@plugdash/readtime/utils`.
