---
"@plugdash/sharepost": minor
---

Build share links at render time in ShareButtons.astro (absolute URLs, `via`, `hashtags`, `url` and `title` props). Removes the sandbox entry, the afterSave hook, KV config and the admin page. `sharepostPlugin()` is now a deprecated no-op native descriptor.

Breaking: the `./sandbox` export, the afterSave hook and the share metadata it wrote are removed, and `sharepostPlugin({ via })` options are ignored. To upgrade, remove `sharepostPlugin()` from astro.config.mjs and pass `via` and `hashtags` as props on `<ShareButtons>` instead.
