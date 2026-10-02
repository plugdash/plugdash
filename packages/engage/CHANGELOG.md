# @plugdash/engage

## 1.1.0

### Minor Changes

- 8277823: EngagementBar passes `url`, `title`, `via`, `hashtags` to ShareButtons and `prefix` to CopyLink. Peers now need heartpost, sharepost and shortlink 0.3.0 or later. The tarball ships only the component, README and LICENSE.

  Breaking: requires `@plugdash/heartpost`, `@plugdash/sharepost` and `@plugdash/shortlink` 0.3.0 or later. To upgrade, bump all three, and in astro.config.mjs register only `heartpostPlugin()` and `shortlinkPlugin()` under `plugins`; remove `sharepostPlugin()` and pass `via` and `hashtags` to `<EngagementBar>` instead.

### Patch Changes

- Updated dependencies [6a2207e]
- Updated dependencies [2188e23]
- Updated dependencies [2cde086]
- Updated dependencies [4cd1843]
- Updated dependencies [0d22ce6]
  - @plugdash/heartpost@0.3.0
  - @plugdash/sharepost@0.3.0
  - @plugdash/shortlink@0.3.0

## 1.0.0

### Patch Changes

- Updated dependencies [95f903d]
  - @plugdash/sharepost@0.2.0
  - @plugdash/heartpost@0.2.0
  - @plugdash/shortlink@0.2.0

## 0.1.1

### Patch Changes

- eefc449: Initial release. Engagement bundle combining heartpost, sharepost, and shortlink into a single EngagementBar.astro component.
- Updated dependencies [eefc449]
- Updated dependencies [eefc449]
- Updated dependencies [eefc449]
  - @plugdash/heartpost@0.1.1
  - @plugdash/sharepost@0.1.1
  - @plugdash/shortlink@0.1.1
