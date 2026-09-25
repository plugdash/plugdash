---
"@plugdash/autobuild": patch
---

Remove the definePlugin() wrapper from sandbox-entry.ts (removed for Standard plugins in emdash 0.13.0+) and rename deprecated capability strings to their canonical names (network:fetch -> network:request, read:content -> content:read).
