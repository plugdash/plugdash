---
name: callout
description: Custom Portable Text block type for callout boxes (info, warning, tip, danger) in EmDash content. Native plugin with auto-wired Astro renderer.
---

# @plugdash/callout

## what it does

Registers a callout block type in the EmDash Portable Text editor. Authors insert callout boxes via the slash command menu and choose from four variants: info, warning, tip, danger.

## plugin type

Native

## capabilities declared

```
(none)
```

## hooks

None. Pure block type registration with renderer.

## install

```bash
pnpm add @plugdash/callout
```

## register

```js
// astro.config.mjs
import { defineConfig } from "astro/config";
import emdash from "emdash";
import { calloutPlugin } from "@plugdash/callout";

export default defineConfig({
  integrations: [
    emdash({
      plugins: [calloutPlugin()], // must be plugins, not sandboxed
    }),
  ],
});
```

## companion component

Auto-wired into `<PortableText>` - no manual setup needed.

For direct import:

```astro
---
import Callout from "@plugdash/callout/Callout.astro"
---
<Callout variant="warning" title="Heads up" body="This feature is experimental." />
```

| Token                               | Default       | Description          |
| ----------------------------------- | ------------- | -------------------- |
| `--plugdash-callout-info-accent`    | `#3b82f6`     | Info accent color    |
| `--plugdash-callout-warning-accent` | `#f59e0b`     | Warning accent color |
| `--plugdash-callout-tip-accent`     | `#22c55e`     | Tip accent color     |
| `--plugdash-callout-danger-accent`  | `#ef4444`     | Danger accent color  |
| `--plugdash-callout-border-width`   | `3px`         | Left border width    |
| `--plugdash-callout-radius`         | `6px`         | Border radius        |
| `--plugdash-callout-padding`        | `1rem 1.25rem`| Inner padding        |
| `--plugdash-callout-icon-size`      | `20px`        | Icon dimensions      |

## configuration

None. No config options - pure block type with renderer.

## what it does not do

- No rich text inside callout body (plain text only)
- No custom icons per callout (variant determines icon)
- No collapsible/expandable behavior
- No hooks, metadata writes, or KV storage
- Cannot be sandboxed or published to the marketplace

## for agents

After installing @plugdash/callout and registering it in astro.config.mjs:

1. No additional setup needed for rendering - block components are auto-wired
   into `<PortableText>`. Callout blocks will render automatically on the site.

2. For direct usage outside Portable Text, import the component:
   ```
   import Callout from "@plugdash/callout/Callout.astro"
   ```
   Usage:
   ```
   <Callout variant="info" body="This is informational." />
   <Callout variant="warning" title="Caution" body="Check your config." />
   ```

3. To verify setup, create a post in the EmDash admin, type `/` in the
   editor, select "Callout", fill in the form, and publish. The callout
   should render on the site with the correct variant styling.

4. If the callout does not render, confirm the plugin is in the `plugins`
   array (not `sandboxed`) in astro.config.mjs. Native plugins cannot
   run in sandboxed mode.

5. To customize colors, override CSS custom properties in your global CSS:
   ```
   :root {
     --plugdash-callout-info-accent: #2563eb;
     --plugdash-callout-danger-accent: #dc2626;
   }
   ```

Metadata written: none
Companion component: Callout.astro
import: `import Callout from "@plugdash/callout/Callout.astro"`
usage: `<Callout variant="info" body="..." />` or auto-wired via PortableText
variants: info (default), warning, tip, danger
