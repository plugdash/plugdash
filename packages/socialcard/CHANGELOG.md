# @plugdash/socialcard

## 0.1.2

### Patch Changes

- 121bffa: Plugin version now comes from package.json, so the version reported to EmDash always matches the published package

## 0.1.1

### Patch Changes

- 78c5b55: Republish with a real build. 0.1.0 of socialcard, fromghost and fromsubstack shipped without dist/, and enrichkit 0.1.0 shipped a stale sandbox bundle that imported a sibling file. fromghost also no longer depends on the unpublished @plugdash/html-to-portable-text (it's bundled now).
