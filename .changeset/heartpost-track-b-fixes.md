---
"@plugdash/heartpost": patch
---

Remove definePlugin() from the sandboxed entrypoint (required by current emdash), rename capabilities to content:read/content:write, and clean up stale peerDependency/version metadata. The unheart route, localStorage fallback, post.id/post.data.id fallback, and admin settings page were all already implemented and tested - no changes needed there.
