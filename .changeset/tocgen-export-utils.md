---
"@plugdash/tocgen": patch
---

Export extractHeadings, toAnchor, deduplicateAnchors, and nestHeadings
from new ./utils subpath so consumers can reuse TOC generation without
reimplementing it. Sync descriptor version with package version.
