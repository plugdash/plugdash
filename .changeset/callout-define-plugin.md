---
"@plugdash/callout": patch
---

Fix admin UI crash by wrapping createPlugin() in definePlugin(). The raw
object was missing capabilities, allowedHosts, storage, and routes - so
EmDash's plugin list API returned capabilities: undefined and the admin
Plugin Manager crashed on `plugin.capabilities.length`. definePlugin()
normalizes all required ResolvedPlugin fields with sensible defaults.
