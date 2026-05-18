---
description: Regenerate the vitepress documentations
---

# Documentation Update Workflow

Audit and update the VitePress documentation to accurately reflect the current state of the codebase.

## Step 1 — Understand what changed

Read the following to understand recent changes:

```bash
git log --oneline -20
```

Also check the latest `CHANGELOG.md` section and scan modified source files (`src/`, `.agents/`) to identify anything new or changed since the last docs update.

## Step 2 — Audit every doc page for staleness

Check each file in the documentation tree for accuracy against the actual source code:

| Doc file | Source of truth |
|---|---|
| `docs/reference/cli.md` | `src/index.ts` — `CliArgs` interface + `parseArgs()` loop |
| `docs/reference/tools.md` | `src/tools/` + `src/server.ts` tool registration |
| `docs/reference/api.md` | `src/lib.ts` exports |
| `docs/architecture/caching.md` | `src/cache/` implementations |
| `docs/architecture/vfs.md` | `src/vfs.ts` |
| `docs/guide/getting-started.md` | `README.md` quick-start + install flow |
| `docs/guide/providers.md` | `src/providers/` constructors + `src/index.ts` provider init |
| `docs/guide/authentication.md` | `src/auth/` + transport options |
| `docs/guide/transports.md` | `src/transports/` |
| `docs/guide/production.md` | Production features in `src/transports/` + middleware |

For each page, note:
- Missing flags, options, or features added since last update
- Outdated examples (wrong flag names, removed options)
- Incorrect or incomplete descriptions

## Step 3 — Update stale content

For each stale doc page identified in Step 2:
- Update CLI flag tables to match `CliArgs` exactly
- Update code examples to use current syntax
- Add documentation for any new features not yet covered
- Remove documentation for removed features

## Step 4 — Check and regenerate diagrams

Scan all doc files for `@image-prompt` comments:

```bash
grep -rn "@image-prompt" docs/
```

For each diagram:
1. Read the `@image-prompt` comment to understand what the diagram should show
2. Compare it against the current architecture (source files, data flow)
3. If the architecture has changed, update **both** the `@image-prompt` comment and regenerate the image using the `generate_image` tool with the updated prompt
4. All diagrams must use dark navy background (`#1a1a2e`), modern flat design, white text

Convention for every diagram in markdown:
```markdown
<!-- @image-prompt <filename>.png: <full generation prompt> -->
![Alt text](/images/<filename>.png)
```

## Step 5 — Check for documentation gaps

Identify any source features that have **no docs coverage** at all:

```bash
grep -rn "export" src/lib.ts
```

Check that every exported symbol in `src/lib.ts` is documented in `docs/reference/api.md`.
Check that every CLI flag in `src/index.ts` appears in `docs/reference/cli.md`.
Check that every MCP tool registered in `src/server.ts` appears in `docs/reference/tools.md`.

Add missing entries.

### What's New Pages

"What's New" pages are **additive** — each release gets its own page (e.g., `whats-new-v0.7.0.md`). Do **not** overwrite or remove previous What's New pages. In the sidebar config (`docs/.vitepress/config.mts`), all What's New pages are grouped under a collapsible **"What's New"** section, with the latest version listed first.

## Step 6 — Verify the VitePress build

```bash
bun run docs:build
```

Fix any broken links, missing images, or build errors before continuing.

## Step 7 — Summary

Report to the user:
- Which pages were updated and why
- Which diagrams were regenerated
- Any gaps found and filled
- Build result (pass / fail with errors)
