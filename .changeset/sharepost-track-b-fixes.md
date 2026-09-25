---
"@plugdash/sharepost": patch
---

Fix definePlugin() removal crash against emdash 0.13+, rename capabilities to canonical content:read/content:write, and enforce the config:collections allowlist that the admin settings page already exposed but the publish hook was silently ignoring.
