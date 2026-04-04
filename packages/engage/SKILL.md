# skill: engage

## what it does

Bundles heartpost, sharepost, and shortlink into a single import. Ships `EngagementBar.astro` that renders heart + share + copy as one visual row.

## plugin type

Not a plugin. Convenience package with an Astro component.

## capabilities declared

None. The three sub-plugins declare their own capabilities.

## hooks

None. The three sub-plugins register their own hooks.

## install

```bash
pnpm add @plugdash/engage
```

## register

engage has no plugin descriptor. Register the three sub-plugins:

```js
// astro.config.mjs
import { heartpostPlugin } from "@plugdash/heartpost";
import { sharepostPlugin } from "@plugdash/sharepost";
import { shortlinkPlugin } from "@plugdash/shortlink";

export default defineConfig({
  integrations: [
    emdash({
      plugins: [
        heartpostPlugin(),
        sharepostPlugin({ via: "yourhandle" }),
        shortlinkPlugin(),
      ],
    }),
  ],
});
```

## companion component

```astro
---
import EngagementBar from "@plugdash/engage/EngagementBar.astro"
---
<EngagementBar post={post} />
```

| Token | Default | Description |
| --- | --- | --- |
| `--plugdash-engage-gap` | `0.375rem` | Gap between children |

Variants: `circle` (default) / `pill` / `ghost`
Sizes: `sm` / `md` (default) / `lg`
Theme: `auto` (default) / `dark` / `light`

## configuration

No configuration. The three sub-plugins are configured individually.

## what it does not do

- Does not contain plugin logic, hooks, or routes
- Does not work without all three sub-plugins installed
- Does not expose the "filled" variant
- Does not write any metadata

## for agents

After installing @plugdash/engage and registering the three sub-plugins in astro.config.mjs:

1. Import the EngagementBar in the post layout:
   ```
   import EngagementBar from "@plugdash/engage/EngagementBar.astro"
   ```

2. Add the component below the post content or in the post header:
   ```
   <EngagementBar post={post} />
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

6. If a child component does not render, check that the corresponding plugin is registered and the post has the required metadata (shareUrls for share, shortlink for copy).

Metadata written: none (the three sub-plugins write their own metadata)
Companion component: EngagementBar.astro
Import: `import EngagementBar from "@plugdash/engage/EngagementBar.astro"`
Usage: `<EngagementBar post={post} />`
Variants: circle (default) / pill / ghost
