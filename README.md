# PlugDash

Plugin catalog for [EmDash](https://emdashcms.com). pnpm monorepo. MIT license.

All packages published to npm under `@plugdash/`.

## Plugins

| Package | Description | Capabilities | Status |
| ------- | ----------- | ------------ | ------ |
| [@plugdash/readtime](./packages/readtime) | Word count and reading time on publish | `read:content`, `write:content` | beta |
| [@plugdash/callout](./packages/callout) | Callout block type (info, warning, tip, danger) | none (native) | beta |
| [@plugdash/shortlink](./packages/shortlink) | Short URLs for EmDash content on publish | `read:content`, `write:content` | beta |
| [@plugdash/sharepost](./packages/sharepost) | Share buttons without 200KB of JavaScript | `read:content`, `write:content` | beta |
| [@plugdash/heartpost](./packages/heartpost) | Heart button with KV-backed per-post counter | `read:content`, `write:content` | beta |

## Development

```bash
pnpm install
pnpm test
pnpm lint
```
