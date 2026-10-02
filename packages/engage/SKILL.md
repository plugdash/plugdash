# skill: engage

## what it does

Bundles heartpost, sharepost, and shortlink into a single import. Ships `EngagementBar.astro` that renders heart + share + copy as one visual row.

## plugin type

Not a plugin. Convenience package with an Astro component.

## capabilities declared

None. The child plugins declare their own capabilities.

## hooks

None. The child plugins register their own hooks.

## install

```bash
pnpm add @plugdash/engage
```

## register

engage has no plugin descriptor. Register heartpost and shortlink (sharepost needs no registration):

```js
// astro.config.mjs
import emdash from "emdash/astro";
import { heartpostPlugin } from "@plugdash/heartpost";
import { shortlinkPlugin } from "@plugdash/shortlink";

export default defineConfig({
	integrations: [emdash({ plugins: [heartpostPlugin(), shortlinkPlugin()] })],
});
```

## companion component

```astro
---
import EngagementBar from "@plugdash/engage/EngagementBar.astro"
---
<EngagementBar post={post} via="yourhandle" />
```

Extra props: `url`, `title`, `via`, `hashtags` (share) and `prefix` (copy, must match the shortlink `prefix` option).

| Token                   | Default    | Description          |
| ----------------------- | ---------- | -------------------- |
| `--plugdash-engage-gap` | `0.375rem` | Gap between children |

Variants: `circle` (default) / `pill` / `ghost`
Sizes: `sm` / `md` (default) / `lg`
Theme: `auto` (default) / `dark` / `light`

## configuration

No configuration. The child plugins are configured individually.

## what it does not do

- Does not contain plugin logic, hooks, or routes
- Does not work without all three packages installed
- Does not expose the "filled" variant
- Does not write any metadata

## for agents

After installing @plugdash/engage and registering heartpost and shortlink in astro.config.mjs:

1. Import the EngagementBar in the post layout:

   ```
   import EngagementBar from "@plugdash/engage/EngagementBar.astro"
   ```

2. Add the component below the post content or in the post header:

   ```
   <EngagementBar post={post} via="yourhandle" />
   ```

3. To customise the bar:

   ```
   <EngagementBar post={post} variant="pill" size="sm" platforms={["twitter", "bluesky"]} />
   ```

4. To hide one component:

   ```
   <EngagementBar post={post} showHeart={false} />
   ```

5. Verify all three plugins are working:
   - Heart button renders and increments on click
   - Share buttons show links for configured platforms
   - Copy button copies the short URL to clipboard

6. If a child component does not render, check that heartpost and shortlink are registered and that `post` comes from getEmDashEntry (heart and copy need `post.data.id`).

Metadata written: none
Companion component: EngagementBar.astro
Import: `import EngagementBar from "@plugdash/engage/EngagementBar.astro"`
Usage: `<EngagementBar post={post} />`
Variants: circle (default) / pill / ghost
