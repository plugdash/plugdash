# @plugdash/codeblock

Shiki syntax highlighting for EmDash code blocks. Each block is highlighted
once, when the post is saved, and the HTML is stored on the block, so a page
view does no highlighting and never loads Shiki. The only client JavaScript is
one small click listener for the copy button.
Ships `CodeBlock.astro` for site-side rendering and exports `highlightCode`
for themes that render code themselves.

## Install

```bash
pnpm add @plugdash/codeblock
```

EmDash templates set `minimumReleaseAge` in `pnpm-workspace.yaml`, which makes
pnpm skip any release younger than 24 hours and quietly install an older one.
To get the latest plugdash release, add it to the exclude list:

```yaml
# pnpm-workspace.yaml
minimumReleaseAgeExclude:
  - "@plugdash/*"
```

## Register

```js
// astro.config.mjs
import { defineConfig } from "astro/config";
import emdash from "emdash/astro";
import { codeblockPlugin } from "@plugdash/codeblock";

export default defineConfig({
  integrations: [
    emdash({
      plugins: [
        codeblockPlugin({ theme: "github-dark", lineNumbers: true }),
      ], // native - must be in plugins, not sandboxed
    }),
  ],
});
```

Native plugin - cannot be sandboxed or published to the EmDash marketplace.
It needs Shiki, which is a Node dependency.

## How it works

1. An author writes a code block in the editor and sets its language
2. On save, a `content:beforeSave` hook runs each `code` block through Shiki
   and stores the result on the block as `pdHighlight: { key, html, ... }`
3. On the site, `CodeBlock.astro` checks the key and prints the stored HTML
4. The rendered page contains Shiki's `<pre class="shiki ...">` markup

The key is a hash of the code, language, theme, light theme, line numbers
setting and plugin version. When any of them changes, the stored HTML no
longer matches and is ignored: the block is highlighted at render time (and
Shiki loads for that request) until the post is saved again, which stores
fresh HTML. So after changing the theme, old posts still render correctly in
the new theme, and re-saving them makes them fast again.

Highlighting never blocks a save. If Shiki fails or takes longer than 30
seconds, the post saves without stored HTML and renders the slow way. Blocks
whose HTML is over 100,000 characters are not stored, to keep the content row
small; they are highlighted at render time.

The admin editor drops unknown fields from code blocks when it saves, so the
stored HTML is rebuilt on every editor save. Unchanged blocks come from an
in-memory cache, so in practice only edited blocks cost anything.

Block components are auto-wired into `<PortableText>` - no manual component
mapping needed. This plugin registers no new block type; it renders the `code`
block EmDash already has.

The highlighter uses Shiki's JavaScript regex engine rather than the default
WASM one, because the WASM engine does not load inside a Cloudflare Worker.

## Config options

| Option        | Type       | Default       | Description                                                  |
| ------------- | ---------- | ------------- | ------------------------------------------------------------ |
| `theme`       | `string`   | `github-dark` | Shiki theme name. Unknown names fall back to the default.    |
| `lightTheme`  | `string`   | see below     | Second theme for light mode, emitted as CSS variables.       |
| `langs`       | `string[]` | common set    | Languages loaded up front. Anything else loads on first use. |
| `lineNumbers` | `boolean`  | `false`       | Render line numbers in the gutter.                           |

Preloaded by default: TypeScript, JavaScript, Python, Go, Rust, Shell, JSON,
YAML, Markdown, HTML, CSS, SQL.

## Companion component

The component works in two modes:

### Auto-wired (default - no setup needed)

Registered via `componentsEntry`, the component automatically renders `code`
blocks in your site's `<PortableText>` output.

### Direct import

For manual usage outside of Portable Text:

```astro
---
import CodeBlock from "@plugdash/codeblock/CodeBlock.astro"
---

<CodeBlock code={source} language="typescript" />
<CodeBlock code={source} language="python" filename="app.py" lineNumbers />
<CodeBlock code={source} language="rust" theme="tokyo-night" lightTheme="catppuccin-latte" />
```

Props override the options passed to `codeblockPlugin()`. Leave them out and
the component uses the site config.

### Props

| Prop          | Type      | Default | Description                              |
| ------------- | --------- | ------- | ---------------------------------------- |
| `code`        | `string`  | -       | Source to highlight (required to render) |
| `language`    | `string`  | -       | Language name. Unknown ones render as plaintext. |
| `filename`    | `string`  | -       | Shown in the header bar                  |
| `theme`       | `string`  | site config | Shiki theme name                   |
| `lightTheme`  | `string`  | site config | Second theme for light mode        |
| `lineNumbers` | `boolean` | site config | Show the line number gutter        |
| `class`       | `string`  | -       | Additional CSS class                     |
| `node`        | `object`  | -       | Block data from PortableText auto-wiring |

Renders nothing when `code` is missing or empty.

## Using the highlighter directly

```astro
---
import { highlightCode } from "@plugdash/codeblock";
const html = await highlightCode(block.code, block.language, { theme: "nord" });
---
<Fragment set:html={html} />
```

`highlightCode` returns Shiki's `<pre>` HTML. Results are cached in memory,
keyed by theme and source, with the hundred most recent kept.

## CSS custom properties

Token and background colours come from the Shiki theme. Everything around the
code is overridable:

| Property                           | Default         | Description                      |
| ---------------------------------- | --------------- | -------------------------------- |
| `--plugdash-codeblock-radius`      | `6px`           | Border radius                    |
| `--plugdash-codeblock-padding`     | `1rem`          | Padding around the code          |
| `--plugdash-codeblock-size`        | `0.875rem`      | Font size                        |
| `--plugdash-codeblock-line-height` | `1.6`           | Line height                      |
| `--plugdash-codeblock-font`        | monospace stack | Font family                      |
| `--plugdash-codeblock-header-padding` | `0.5rem 1rem` | Header bar padding             |
| `--plugdash-codeblock-header-bg`   | theme bg, tinted | Header bar background           |
| `--plugdash-codeblock-header-color`| theme text, muted | Header bar text                |
| `--plugdash-codeblock-header-border`| theme text, faint | Line between header and code  |
| `--plugdash-copy-success-color`    | `#22c55e`       | Copy button after a copy         |
| `--plugdash-codeblock-gutter-width`| `2rem`          | Line number column width         |
| `--plugdash-codeblock-gutter-color`| theme text, faded | Line number colour             |

The header and gutter defaults are mixed from the theme's own background and
text colours, so they match any theme, light or dark.

## Light and dark mode

With no config, blocks render `github-dark` and switch to `github-light` in
light mode. Setting `theme` turns that off, so a site that picks a dark theme
stays dark. To switch with your own pair, set both. Any
[Shiki theme](https://shiki.style/themes) works:

```js
codeblockPlugin({ theme: "tokyo-night", lightTheme: "catppuccin-latte" })
```

The light theme is used when the OS prefers light, unless the site forces a
mode on `<html>` with `data-theme="light"` / `data-theme="dark"` or a
`.light` / `.dark` class. Both conventions are respected in either direction.
If your site is dark by default with no marker on `<html>`, set
`data-theme="dark"` explicitly, or light-OS visitors get light code blocks.

Example override:

```css
:root {
  --plugdash-codeblock-radius: 0;
  --plugdash-codeblock-size: 0.8125rem;
}
```

## Edge cases

- Unknown or missing language renders as plaintext instead of throwing
- `text`, `txt`, `plain`, `plaintext` and `none` all mean plaintext
- Empty code renders an empty `<pre>` block
- Code over 10,000 lines is cut off with a trailing truncation notice
- Unknown theme names fall back to `github-dark`

## What it does not do

- No line highlighting or diff view
- No client-side highlighting. Light/dark switching is CSS only
- No new editor block type
- No migration step. Posts saved before this version render at request time
  until they are saved again
- No metadata writes or KV storage. The only thing it writes is
  `pdHighlight` on each `code` block, which declares `content:write`
