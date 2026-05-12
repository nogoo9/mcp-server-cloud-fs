---
trigger: always_on
---

Before pushing to a remote (git push), always run the following in order:

1. `bun run format` — lint and auto-fix
2. `bun run typecheck` — TypeScript compiler check
3. `bun test` — run all unit tests (excludes integration/e2e that need infra)

Only push if all three pass. If any fail, fix the issues first.
