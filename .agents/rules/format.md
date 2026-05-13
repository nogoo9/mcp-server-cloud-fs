---
trigger: always_on
description: After any code change, run format and typecheck before stopping.
---

After making any code changes, run the `/format` workflow:

1. `bun run format` — Biome lint + auto-fix
2. `bun run typecheck` — TypeScript compiler check

Do not consider a coding task complete until both pass with zero errors.