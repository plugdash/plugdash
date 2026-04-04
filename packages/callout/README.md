# @plugdash/callout

Styled callout boxes for EmDash content - info, warning, tip, and danger.
Registers a custom Portable Text block type that authors insert via the
editor's slash command menu. Ships `Callout.astro` for site-side rendering.
The block type WordPress themes always hacked with shortcodes.

## Install

```bash
pnpm add @plugdash/callout
```

## Register

```js
// astro.config.mjs
import { defineConfig } from "astro/config";
import emdash from "emdash";
import { calloutPlugin } from "@plugdash/callout";

export default defineConfig({
  integrations: [
    emdash({
      plugins: [calloutPlugin()], // native - must be in plugins, not sandboxed
    }),
  ],
});
```

Native plugin - cannot be sandboxed or published to the EmDash marketplace.

## How it works

1. Author types `/` in the editor and selects "Callout"
2. A form appears with variant (info/warning/tip/danger), optional title, body text, and icon toggle
3. The callout block is inserted into the Portable Text body
4. On the site, `Callout.astro` renders it with variant-specific styling

Block components are auto-wired into `<PortableText>` - no manual component mapping needed.

## Config options

None. This plugin has no configuration - it registers a block type and provides a renderer.

## Companion component

The component works in two modes:

### Auto-wired (default - no setup needed)

Registered via `componentsEntry`, the component automatically renders callout blocks
in your site's `<PortableText>` output.

### Direct import

For manual usage outside of Portable Text:

```astro
---
import Callout from "@plugdash/callout/Callout.astro"
---

<Callout variant="warning" title="Deprecation" body="This API will be removed in v3." />
<Callout variant="tip" body="Try the new approach instead." />
<Callout variant="danger" title="Breaking change" body="The config format has changed." icon={false} />
```

### Props

| Prop      | Type                                       | Default  | Description                        |
| --------- | ------------------------------------------ | -------- | ---------------------------------- |
| `variant` | `"info" \| "warning" \| "tip" \| "danger"` | `"info"` | Visual style and icon              |
| `title`   | `string`                                   | -        | Optional heading above the body    |
| `body`    | `string`                                   | -        | Callout content (required to render) |
| `icon`    | `boolean`                                  | `true`   | Show the variant icon              |
| `theme`   | `"auto" \| "dark" \| "light"`              | `"auto"` | Color scheme                       |
| `class`   | `string`                                   | -        | Additional CSS class               |
| `node`    | `object`                                   | -        | Block data from PortableText auto-wiring |

Renders nothing when `body` is missing or empty.

## CSS custom properties

All visual values are overridable via CSS custom properties:

| Property                            | Default         | Description                    |
| ----------------------------------- | --------------- | ------------------------------ |
| `--plugdash-callout-info-accent`    | `#3b82f6`       | Info variant border and icon   |
| `--plugdash-callout-info-bg`        | accent at 8%    | Info variant background        |
| `--plugdash-callout-warning-accent` | `#f59e0b`       | Warning variant border and icon |
| `--plugdash-callout-warning-bg`     | accent at 8%    | Warning variant background     |
| `--plugdash-callout-tip-accent`     | `#22c55e`       | Tip variant border and icon    |
| `--plugdash-callout-tip-bg`         | accent at 8%    | Tip variant background         |
| `--plugdash-callout-danger-accent`  | `#ef4444`       | Danger variant border and icon |
| `--plugdash-callout-danger-bg`      | accent at 8%    | Danger variant background      |
| `--plugdash-callout-border-width`   | `3px`           | Left border thickness          |
| `--plugdash-callout-radius`         | `6px`           | Border radius                  |
| `--plugdash-callout-padding`        | `1rem 1.25rem`  | Inner padding                  |
| `--plugdash-callout-font`           | Lexend fallback | Font family                    |
| `--plugdash-callout-title-weight`   | `600`           | Title font weight              |
| `--plugdash-callout-icon-size`      | `20px`          | Icon dimensions                |

Example override:

```css
:root {
  --plugdash-callout-info-accent: #2563eb;
  --plugdash-callout-radius: 0;
  --plugdash-callout-border-width: 4px;
}
```

## What it does not do

- No rich text inside callout body - plain text only
- No custom icons per callout instance - variant determines the icon
- No collapsible or expandable behavior
- No animation on render
- No server-side processing, hooks, or metadata writes
- No KV storage or configuration
