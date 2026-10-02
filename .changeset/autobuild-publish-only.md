---
"@plugdash/autobuild": minor
---

Rewrite as a native plugin: fire on publish, unpublish and delete of a published entry only (not on autosave), read options from createPlugin so the hook URL works in production, debounce through KV, and take the hook URL from an admin secret setting.

Breaking: the `statuses` option is removed (deploys fire on publish, unpublish and delete of a published entry only), the `./sandbox` export is gone, and emdash >=1.0.0 is required. To upgrade, move `autobuildPlugin()` from `sandboxed` to `plugins` in astro.config.mjs if it was there, drop `statuses` from its options, and read the hook URL with `process.env` (or set it in the admin, which needs `EMDASH_ENCRYPTION_KEY`).
