# @plugdash/enrichkit

## 0.2.0

### Minor Changes

- 9c2d20e: Stop paying for wasted LLM calls. Enrichkit is now a native plugin that runs on `content:afterPublish` only (autosaves make no call), skips the call when the title and body are unchanged, uses structured output with no retry, honours a `timeoutMs` option, and reads the API key from an encrypted `apiKey` admin setting. Results move from `data.metadata.enrichkit` to plugin KV `result:<id>` plus an empty `seo.description`. Breaking: the `./sandbox` and `./enrich-logic` exports are removed, results are no longer written to `data.metadata.enrichkit`, and emdash >=1.0.0 is required. To upgrade, move `enrichkitPlugin()` from `sandboxed` to `plugins` in astro.config.mjs if it was there, set the API key in the admin (needs `EMDASH_ENCRYPTION_KEY`; the `apiKey` option still works as a fallback), and change any template or agent that reads `data.metadata.enrichkit` to read `seo.description` or the plugin KV `result:<id>`.

## 0.1.2

### Patch Changes

- 121bffa: Plugin version now comes from package.json, so the version reported to EmDash always matches the published package

## 0.1.1

### Patch Changes

- 78c5b55: Republish with a real build. 0.1.0 of socialcard, fromghost and fromsubstack shipped without dist/, and enrichkit 0.1.0 shipped a stale sandbox bundle that imported a sibling file. fromghost also no longer depends on the unpublished @plugdash/html-to-portable-text (it's bundled now).
