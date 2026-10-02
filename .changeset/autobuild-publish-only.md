---
"@plugdash/autobuild": minor
---

Rewrite as a native plugin: fire on publish, unpublish and delete of a published entry only (not on autosave), read options from createPlugin so the hook URL works in production, debounce through KV, and take the hook URL from an admin secret setting.
