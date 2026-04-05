---
"@plugdash/readtime": minor
"@plugdash/tocgen": minor
"@plugdash/sharepost": minor
"@plugdash/heartpost": minor
"@plugdash/shortlink": minor
"@plugdash/autobuild": minor
---

Add Block Kit admin configuration pages. Each plugin now ships a settings form at Plugins - [Name] - Settings in the EmDash admin, writing to the same KV config keys the hooks already read. Autobuild masks the stored hook URL and preserves it when the input is left blank. Shortlink's admin page dispatches on block_action in addition to button_click.
