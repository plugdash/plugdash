---
"@plugdash/shortlink": minor
---

Rebuilt on EmDash native redirects. On publish, each entry gets one 301 redirect `/s/<code>` (group `shortlink`), where the code is the last 8 characters of the entry id. The plugin is now native and needs `redirects:write` and `schema:read`.

Breaking: `RedirectPage.astro`, the `./sandbox` export, the resolve route, the admin table, `autoCreate` and the shortlink metadata are removed. To upgrade, register `shortlinkPlugin()` under `plugins` (not `sandboxed`) in astro.config.mjs, drop `autoCreate` from its options, and delete `src/pages/s/[code].astro`. Generated 0.2.x codes keep working, because the plugin recreates them as redirects on the entry's next publish. Codes you made by hand in 0.2.x are not migrated: add them as redirects in the admin Redirects screen. Deleting a shortlink redirect does not stick, because the next publish creates it again; disable it in the Redirects screen instead. `CopyLink` now builds the URL from `post.data.id` and takes a `prefix` prop.
