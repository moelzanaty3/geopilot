---
name: init
description: Create geo.config.json with geopilot init (preview first, never infers your origin)
argument-hint: "[--origin https://… --language en]"
userOnly: true
---

Help me create `geo.config.json` with geopilot. Arguments: $ARGUMENTS

1. Run `geopilot --version`; if it is not `{{ENGINE_VERSION}}`, use `{{CLI}}` instead of `geopilot`.
2. Ask me for the site origin and language if I did not give them. Never infer them, the crawler policy, or app identifiers.
3. Run `geopilot init --origin <origin> --language <tag>` without `--yes`, show me the preview, and only after I agree run it again with `--yes`.
4. Do not change any other configuration.
