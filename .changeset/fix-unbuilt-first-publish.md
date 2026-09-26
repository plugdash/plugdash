---
"@plugdash/socialcard": patch
"@plugdash/fromghost": patch
"@plugdash/fromsubstack": patch
"@plugdash/enrichkit": patch
---

Republish with a real build. 0.1.0 of socialcard, fromghost and fromsubstack shipped without dist/, and enrichkit 0.1.0 shipped a stale sandbox bundle that imported a sibling file. fromghost also no longer depends on the unpublished @plugdash/html-to-portable-text (it's bundled now).
