---
name: readtime
description: Reading time for EmDash posts, computed at render time by a companion component. No plugin registration, hooks or stored data.
---

# @plugdash/readtime

## what it does

Computes reading time and word count from the post body when the page renders. Ships `ReadingTime.astro` to show it.

## plugin type

None needed. `readtimePlugin()` is a deprecated no-op (native descriptor, no hooks, no capabilities) kept so old configs load.

## capabilities declared

```
none
```

## hooks

None.

## install

```bash
pnpm add @plugdash/readtime
```

## register

Not needed. Remove `readtimePlugin()` from `astro.config.mjs` if present.

## companion component

```astro
---
import ReadingTime from "@plugdash/readtime/ReadingTime.astro";
---

<ReadingTime post={post} />
```

| Prop           | Default      | Description                                                       |
| -------------- | ------------ | ----------------------------------------------------------------- |
| wordsPerMinute | `238`        | Reading speed                                                     |
| field          | auto         | Portable Text field (`content`, then `body`, then first PT array) |
| label          | `"min read"` | Text after the number                                             |
| variant        | `"inline"`   | `badge` / `pill` / `inline` / `minimal`                           |
| size           | `"md"`       | `sm` / `md` / `lg`                                                |
| theme          | `"auto"`     | `auto` / `dark` / `light`                                         |
| showWords      | `false`      | Show word count                                                   |
| attribution    | `false`      | Show "plugdash" link                                              |
| class          | -            | Extra class                                                       |

CSS tokens: `--plugdash-rt-color`, `--plugdash-rt-size`, `--plugdash-rt-font`, `--plugdash-rt-bg`, `--plugdash-rt-border`, `--plugdash-rt-radius`, `--plugdash-rt-padding`.

For plain numbers: `import { getReadingTime } from "@plugdash/readtime/utils"`.

## configuration

Props only. See the table above.

## what it does not do

- No hooks, stored data or `metadata` writes
- No per-post speed override
- Does not count code blocks, images or embeds

## for agents

After installing @plugdash/readtime (no registration needed):

1. Import the component in the post layout:

   ```
   import ReadingTime from "@plugdash/readtime/ReadingTime.astro"
   ```

2. Add it where reading time should show. On the blog template, replace `<span>{readingTime} min read</span>` in `src/pages/posts/[slug].astro`:

   ```
   <ReadingTime post={post} />
   ```

3. Load a published post and check the page shows "N min read". The component reads the Portable Text field (`content` on official templates), so no publish hook or metadata field is involved.

4. If nothing renders, the post has no Portable Text array in `data`. Pass `field="<name>"`.

Metadata written: none.
Companion component: ReadingTime.astro
import: import ReadingTime from "@plugdash/readtime/ReadingTime.astro"
usage: <ReadingTime post={post} />
variants: inline (default) / badge / pill / minimal
