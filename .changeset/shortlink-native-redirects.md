---
"@plugdash/shortlink": minor
---

Rebuilt on EmDash native redirects. On publish, each entry gets one 301 redirect `/s/<code>` (group `shortlink`), where the code is the last 8 characters of the entry id. The plugin is now native and needs `redirects:write` and `schema:read`.

Breaking for 0.2.x sites: `RedirectPage.astro`, the `./sandbox` export, the resolve route, the admin table, `autoCreate` and the shortlink metadata are removed. Delete `src/pages/s/[code].astro`. Codes from 0.2.x keep working, because the plugin recreates them as redirects on the entry's next publish. `CopyLink` now builds the URL from `post.data.id` and takes a `prefix` prop.
