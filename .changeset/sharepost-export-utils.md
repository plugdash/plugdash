---
"@plugdash/sharepost": patch
---

Export generateShareUrl and generateAllShareUrls from new ./utils subpath
so consumers can reuse share URL generation without reimplementing it.
Sync descriptor version with package version.
