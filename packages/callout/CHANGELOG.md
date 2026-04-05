# @plugdash/callout

## 0.1.2

### Patch Changes

- c0b53d6: Fix admin UI crash by wrapping createPlugin() in definePlugin(). The raw
  object was missing capabilities, allowedHosts, storage, and routes - so
  EmDash's plugin list API returned capabilities: undefined and the admin
  Plugin Manager crashed on `plugin.capabilities.length`. definePlugin()
  normalizes all required ResolvedPlugin fields with sensible defaults.

## 0.1.1

### Patch Changes

- eefc449: Initial release. Native callout block type for EmDash with info, warning, tip, and danger styles. Ships Callout.astro renderer.
