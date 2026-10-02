---
"@plugdash/engage": minor
---

EngagementBar passes `url`, `title`, `via`, `hashtags` to ShareButtons and `prefix` to CopyLink. Peers now need heartpost, sharepost and shortlink 0.3.0 or later. The tarball ships only the component, README and LICENSE.

Breaking: requires `@plugdash/heartpost`, `@plugdash/sharepost` and `@plugdash/shortlink` 0.3.0 or later. To upgrade, bump all three, and in astro.config.mjs register only `heartpostPlugin()` and `shortlinkPlugin()` under `plugins`; remove `sharepostPlugin()` and pass `via` and `hashtags` to `<EngagementBar>` instead.
