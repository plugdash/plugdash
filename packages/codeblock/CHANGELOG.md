# @plugdash/codeblock

## 0.4.0

### Minor Changes

- baa62c1: Highlight code blocks once on save and store the HTML on the block, so page views never load Shiki. Shiki is now loaded lazily, the plugin declares `content:write` (the admin plugin list shows it), and the README covers `minimumReleaseAgeExclude` and the `emdash/astro` import.

## 0.3.0

### Minor Changes

- 95a8377: Switch between github-dark and github-light by default when no theme is set, fix light mode leaving dark text on white span patches, and stop site pre styles (borders, background images) bleeding into blocks

## 0.2.0

### Minor Changes

- 6ae12da: Add a copy button and a divider line between the header and the code
- 9c8e4ba: codeblockPlugin() options now reach the auto-wired component, the header and gutter take their colours from the theme, and light mode respects data-theme and .light/.dark on html
