---
name: codeblock
description: Shiki syntax highlighting for EmDash code blocks. Native plugin with an auto-wired Astro renderer, highlighted server-side, with a copy button.
---

# @plugdash/codeblock

## what it does

Renders the code blocks EmDash already stores with Shiki syntax highlighting. Each block is highlighted once on save and the HTML is stored on the block, so page views never load Shiki. Every block has a header with the language and a copy button.

## plugin type

Native

## capabilities declared

```
content:write
```

Required for `content:beforeSave`; EmDash silently skips that hook without it.

## hooks

`content:beforeSave` (timeout 30 s, errorPolicy `continue`). Highlights every `code` node in the saved data and stores `pdHighlight: { key, html, bg, fg, lightBg?, lightFg? }` on it. Skips nodes whose key already matches, does not store HTML over 100,000 characters, and never fails a save. The key hashes code, language, theme, lightTheme, lineNumbers and plugin version; on a mismatch the component highlights at render time instead.

## install

```bash
pnpm add @plugdash/codeblock
```

## register

```js
// astro.config.mjs
import { defineConfig } from "astro/config";
import emdash from "emdash/astro";
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

| Token                                | Default           | Description                      |
| ------------------------------------ | ----------------- | -------------------------------- |
| `--plugdash-codeblock-radius`        | `6px`             | Border radius                    |
| `--plugdash-codeblock-padding`       | `1rem`            | Padding around the code          |
| `--plugdash-codeblock-size`          | `0.875rem`        | Font size                        |
| `--plugdash-codeblock-line-height`   | `1.6`             | Line height                      |
| `--plugdash-codeblock-font`          | monospace stack   | Font family                      |
| `--plugdash-codeblock-header-bg`     | theme bg, tinted  | Filename/language bar background |
| `--plugdash-codeblock-header-color`  | theme text, muted | Filename/language bar text       |
| `--plugdash-codeblock-header-border` | theme text, faint | Line between header and code     |
| `--plugdash-copy-success-color`      | `#22c55e`         | Copy button after a copy         |
| `--plugdash-codeblock-gutter-width`  | `2rem`            | Line number column width         |
| `--plugdash-codeblock-gutter-color`  | theme text, faded | Line number colour               |

Background and token colours come from the Shiki theme, not from these tokens.

## configuration

| Option        | Type       | Default                                    | Description                                                  |
| ------------- | ---------- | ------------------------------------------ | ------------------------------------------------------------ |
| `theme`       | `string`   | `github-dark`                              | Shiki theme name. Unknown names fall back to the default.    |
| `lightTheme`  | `string`   | `github-light` if `theme` unset, else none | Second theme for light mode, emitted as CSS variables.       |
| `langs`       | `string[]` | common set                                 | Languages loaded up front. Anything else loads on first use. |
| `lineNumbers` | `boolean`  | `false`                                    | Render line numbers in the gutter.                           |

Preloaded by default: TypeScript, JavaScript, Python, Go, Rust, Shell, JSON, YAML, Markdown, HTML, CSS, SQL.

## what it does not do

- No line highlighting, no diff view
- No client-side highlighting, so no runtime language switching
- No new editor block type - it renders the `code` block EmDash already has
- No migration step: posts saved before this version, or before a theme change, render at request time until saved again
- No metadata writes or KV storage
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

5. To verify pre-highlighting, save the post, then read it back through the
   content API: each `code` node should carry `pdHighlight.key` and
   `pdHighlight.html`. If it does not, check that the plugin is registered and
   look for a "codeblock: pre-highlight failed" warning in the server log.

6. If nothing renders differently at all, confirm the plugin is in the `plugins`
   array (not `sandboxed`) in astro.config.mjs. Native plugins cannot run in
   sandboxed mode.

7. With no config, blocks switch between github-dark and github-light. For a
   custom pair, set both themes and let the CSS variables switch:

   ```
   codeblockPlugin({ theme: "tokyo-night", lightTheme: "catppuccin-latte" })
   ```

   Light mode follows prefers-color-scheme, overridden by `data-theme="light|dark"`
   or a `.light` / `.dark` class on `<html>`. A site that is dark with no marker
   on `<html>` should set `data-theme="dark"`, or light-OS visitors get light blocks.

8. Options passed to `codeblockPlugin()` apply to every block, auto-wired or
   imported. Props on `<CodeBlock>` override them per block (a prop that
   changes the key makes that block highlight at render time).

9. On EmDash templates, add `"@plugdash/*"` to `minimumReleaseAgeExclude` in
   `pnpm-workspace.yaml`, or pnpm installs an older release with no error.

Metadata written: none. Each `code` node gets `pdHighlight` (object: key, html, bg, fg, lightBg?, lightFg?)
Companion component: CodeBlock.astro
import: `import CodeBlock from "@plugdash/codeblock/CodeBlock.astro"`
usage: `<CodeBlock code="..." language="typescript" />` or auto-wired via PortableText
block type rendered: `code` (built into EmDash)
