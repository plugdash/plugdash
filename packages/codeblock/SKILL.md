---
name: codeblock
description: Shiki syntax highlighting for EmDash code blocks. Native plugin with an auto-wired Astro renderer, highlighted server-side with zero client JavaScript.
---

# @plugdash/codeblock

## what it does

Renders the code blocks EmDash already stores with Shiki syntax highlighting. Highlighting happens server-side at render time, so the browser gets plain coloured HTML and no JavaScript.

Nothing is rewritten on save. Change the theme and every existing post picks it up on the next render.

## plugin type

Native

## capabilities declared

```
content:read
```

## hooks

None. codeblock exports a transform function that runs at render time, not a plugin that runs on save.

## install

```bash
pnpm add @plugdash/codeblock
```

## register

```js
// astro.config.mjs
import { defineConfig } from "astro/config";
import emdash from "emdash";
import { codeblockPlugin } from "@plugdash/codeblock";

export default defineConfig({
  integrations: [
    emdash({
      plugins: [codeblockPlugin({ theme: "github-dark" })], // must be plugins, not sandboxed
    }),
  ],
});
```

## companion component

Auto-wired into `<PortableText>` - no manual setup needed.

For direct import:

```astro
---
import CodeBlock from "@plugdash/codeblock/CodeBlock.astro"
---
<CodeBlock code={source} language="typescript" theme="github-dark" lineNumbers />
```

Or call the highlighter yourself from a theme:

```astro
---
import { highlightCode } from "@plugdash/codeblock";
const html = await highlightCode(block.code, block.language);
---
<Fragment set:html={html} />
```

| Token                                  | Default       | Description                  |
| -------------------------------------- | ------------- | ---------------------------- |
| `--plugdash-codeblock-radius`           | `6px`         | Border radius                |
| `--plugdash-codeblock-padding`          | `1rem`        | Padding around the code      |
| `--plugdash-codeblock-size`             | `0.875rem`    | Font size                    |
| `--plugdash-codeblock-line-height`      | `1.6`         | Line height                  |
| `--plugdash-codeblock-font`             | monospace stack | Font family                |
| `--plugdash-codeblock-header-bg`        | theme bg, tinted | Filename/language bar background |
| `--plugdash-codeblock-header-color`     | theme text, muted | Filename/language bar text |
| `--plugdash-codeblock-gutter-width`     | `2rem`        | Line number column width     |
| `--plugdash-codeblock-gutter-color`     | theme text, faded | Line number colour       |

Background and token colours come from the Shiki theme, not from these tokens.

## configuration

| Option       | Type       | Default        | Description                                        |
| ------------ | ---------- | -------------- | -------------------------------------------------- |
| `theme`      | `string`   | `github-dark`  | Shiki theme name. Unknown names fall back to the default. |
| `lightTheme` | `string`   | none           | Second theme for light mode, emitted as CSS variables. |
| `langs`      | `string[]` | common set     | Languages loaded up front. Anything else loads on first use. |
| `lineNumbers`| `boolean`  | `false`        | Render line numbers in the gutter.                 |

Preloaded by default: TypeScript, JavaScript, Python, Go, Rust, Shell, JSON, YAML, Markdown, HTML, CSS, SQL.

## what it does not do

- No copy button, no line highlighting, no diff view
- No client-side highlighting, so no runtime language switching
- No new editor block type - it renders the `code` block EmDash already has
- Does not rewrite stored content, so nothing to migrate when the theme changes
- No hooks, metadata writes, or KV storage
- Cannot be sandboxed or published to the marketplace

## for agents

After installing @plugdash/codeblock and registering it in astro.config.mjs:

1. No additional setup needed for rendering - block components are auto-wired
   into `<PortableText>`. Existing `code` blocks start rendering highlighted.

2. For direct usage outside Portable Text, import the component:
   ```
   import CodeBlock from "@plugdash/codeblock/CodeBlock.astro"
   ```
   Usage:
   ```
   <CodeBlock code={source} language="python" />
   <CodeBlock node={block} lineNumbers theme="nord" />
   ```

3. To verify setup, publish a post containing a code block with a language set,
   then view it on the site. The code should have coloured tokens and a
   `class="shiki github-dark"` wrapper in the page source.

4. If code renders unhighlighted, check the block's language. Unknown languages
   fall back to plaintext on purpose rather than throwing.

5. If nothing renders differently at all, confirm the plugin is in the `plugins`
   array (not `sandboxed`) in astro.config.mjs. Native plugins cannot run in
   sandboxed mode.

6. For light and dark together, set both themes and let the CSS variables switch:
   ```
   codeblockPlugin({ theme: "tokyo-night", lightTheme: "catppuccin-latte" })
   ```
   Light mode follows prefers-color-scheme, overridden by `data-theme="light|dark"`
   or a `.light` / `.dark` class on `<html>`.

7. Options passed to `codeblockPlugin()` apply to every block, auto-wired or
   imported. Props on `<CodeBlock>` override them per block.

Metadata written: none
Companion component: CodeBlock.astro
import: `import CodeBlock from "@plugdash/codeblock/CodeBlock.astro"`
usage: `<CodeBlock code="..." language="typescript" />` or auto-wired via PortableText
block type rendered: `code` (built into EmDash)
