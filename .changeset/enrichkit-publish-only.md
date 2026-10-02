---
"@plugdash/enrichkit": minor
---

Stop paying for wasted LLM calls. Enrichkit is now a native plugin that runs on `content:afterPublish` only (autosaves make no call), skips the call when the title and body are unchanged, uses structured output with no retry, honours a `timeoutMs` option, and reads the API key from an encrypted `apiKey` admin setting. Results move from `data.metadata.enrichkit` to plugin KV `result:<id>` plus an empty `seo.description`. Breaking: the `./sandbox` and `./enrich-logic` exports are removed, results are no longer written to `data.metadata.enrichkit`, and emdash >=1.0.0 is required. To upgrade, move `enrichkitPlugin()` from `sandboxed` to `plugins` in astro.config.mjs if it was there, set the API key in the admin (needs `EMDASH_ENCRYPTION_KEY`; the `apiKey` option still works as a fallback), and change any template or agent that reads `data.metadata.enrichkit` to read `seo.description` or the plugin KV `result:<id>`.
