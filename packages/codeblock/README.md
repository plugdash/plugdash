# @plugdash/codeblock

Shiki syntax highlighting for EmDash code blocks. Highlighting runs on the
server at render time, so the page ships coloured HTML and no JavaScript.
Ships `CodeBlock.astro` for site-side rendering and exports `highlightCode`
for themes that render code themselves.

Nothing is rewritten on save. Change the theme and every existing post picks
it up on the next render.

## Install

```bash
pnpm add @plugdash/codeblock
```

## Register

```js
// astro.config.mjs
import { defineConfig } from "astro/config";
import emdash from "emdash";
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
2. EmDash stores it as a `code` block in the Portable Text body, unchanged
3. On the site, `CodeBlock.astro` runs the code through Shiki
4. The rendered page contains Shiki's `<pre class="shiki ...">` markup

Block components are auto-wired into `<PortableText>` - no manual component
mapping needed. This plugin registers no new block type; it renders the `code`
block EmDash already has.

The highlighter uses Shiki's JavaScript regex engine rather than the default
WASM one, because the WASM engine does not load inside a Cloudflare Worker.

## Config options

| Option        | Type       | Default       | Description                                                  |
| ------------- | ---------- | ------------- | ------------------------------------------------------------ |
| `theme`       | `string`   | `github-dark` | Shiki theme name. Unknown names fall back to the default.    |
| `lightTheme`  | `string`   | -             | Second theme for light mode, emitted as CSS variables.       |
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
| `--plugdash-codeblock-gutter-width`| `2rem`          | Line number column width         |
| `--plugdash-codeblock-gutter-color`| theme text, faded | Line number colour             |

The header and gutter defaults are mixed from the theme's own background and
text colours, so they match any theme, light or dark.

## Light and dark mode

Set both themes. Any [Shiki theme](https://shiki.style/themes) works:

```js
codeblockPlugin({ theme: "tokyo-night", lightTheme: "catppuccin-latte" })
```

The light theme is used when the OS prefers light, unless the site forces a
mode on `<html>` with `data-theme="light"` / `data-theme="dark"` or a
`.light` / `.dark` class. Both conventions are respected in either direction.

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

- No copy button, line highlighting, or diff view
- No client-side highlighting. Light/dark switching is CSS only; changing to
  a different theme pair needs a re-render
- No new editor block type
- Does not rewrite stored content, so nothing to migrate
- No hooks, metadata writes, or KV storage
