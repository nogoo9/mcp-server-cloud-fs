---
description: Determine the appropriate semver bump from commits since the last tag, update all version files, CHANGELOG, and docs, then commit the bump.
---

# Version Bump Workflow

## Step 1 — Find the last version tag

```bash
git describe --tags --abbrev=0
```

Record the tag (e.g. `v0.4.0`).

## Step 2 — Review commits since the last tag

```bash
git log --oneline <last-tag>..HEAD
```

Read every commit subject and classify each one using Conventional Commits semantics:

| Indicator | Bump |
|---|---|
| `feat:` / new capability added | **minor** |
| `fix:` / `perf:` / `refactor:` / `docs:` / `chore:` | **patch** |
| `BREAKING CHANGE` in body, or `!` after type (e.g. `feat!:`) | **major** |

Apply the highest-severity bump found across all commits.

## Step 3 — Compute the new version

Calculate `<new_version>` by incrementing the appropriate semver component of the current version (from `package.json`). Reset lower components to 0 (e.g. minor bump: `0.4.0` → `0.5.0`).

## Step 4 — Update version in all three files

The version string appears in **exactly three places**. Update all of them to `<new_version>`:

- `package.json` — top-level `"version"` field
- `server.json` — top-level `"version"` field AND the nested `"version"` inside the server metadata object

Use `sed` or direct file edits. After editing, verify with:

```bash
grep '"version"' package.json server.json
```

## Step 5 — Update CHANGELOG.md

Add a new `## [<new_version>] — <YYYY-MM-DD>` section at the top (below the header) with:

- `### Added` — new features (`feat:` commits)
- `### Fixed` — bug fixes (`fix:` commits)
- `### Security` — security fixes
- `### Changed` — other notable changes (`refactor:`, `perf:`)
- `### Docs` — documentation-only changes (omit if minor)

Summarise each commit as a bullet. Omit purely mechanical commits (e.g. formatting, CI tweaks) unless they are user-visible.

## Step 6 — Update README badge / version references

Search the README for hardcoded version strings referencing the old version and update them:

```bash
grep -n '<old_version>' README.md
```

Update any `npx`, `npm install`, or shield badge URLs that embed the version number.

## Step 7 — Update VitePress docs if needed

Only if any of the following changed:
- CLI flags (update `docs/reference/cli.md`)
- Architecture (update relevant `docs/architecture/*.md`)
- Guides (update relevant `docs/guide/*.md`)

## Step 8 — Run format + typecheck

```bash
bun run format
```

```bash
bun run typecheck
```

Stop and fix any errors before continuing.

## Step 9 — Commit the bump

```bash
git add -A
```

```bash
git commit -m "chore: bump version to <new_version>"
```

Report the new version, the bump type applied, and the commit hash.
