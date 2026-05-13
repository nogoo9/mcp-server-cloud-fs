---
trigger: model_decision
description: Whenever a new feature is implemented and committed, update all documentation.
---

After implementing and committing a new feature, run the `/docs` workflow to keep documentation in sync with the code:

- **`docs/reference/cli.md`** — update if any CLI flags were added, changed, or removed
- **`docs/reference/tools.md`** — update if any MCP tools were added, changed, or removed
- **`docs/reference/api.md`** — update if any public library exports changed
- **`docs/architecture/*.md`** — update if VFS, caching, or transport behaviour changed
- **`docs/guide/*.md`** — update if provider setup, authentication, or production config changed
- **`README.md`** — update the relevant section (quick-start, caching, TLS, etc.)
- **`CHANGELOG.md`** — add a bullet to the appropriate `[Unreleased]` or current version section

If diagrams are affected, regenerate them using the `generate_image` tool and update the `@image-prompt` comment above each image.

Verify with `bun run docs:build` before considering the task complete.