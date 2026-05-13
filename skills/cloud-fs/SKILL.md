---
name: cloud-fs
description: >
  Interact with cloud object storage (AWS S3, Azure Blob, GCS, MinIO, RustFS,
  SQLite, in-memory) through a POSIX-like virtual filesystem — ls, cat, head,
  tail, grep, find, tree, cp, mv, mkdir, edit, stat — backed by the cloud-fs
  VFS (npm package @nogoo9/mcp-server-cloud-fs, binaries `cloud-fs-mcp` and
  `cloud-fs`). Use this skill whenever the user wants to browse, read, search,
  edit, copy, or move files in their S3 bucket, Azure container, GCS bucket,
  MinIO/RustFS bucket, SQLite "bucket", or in-memory store — including phrases
  like "show me what's in s3://...", "grep TODO across my docs bucket", "list
  files in my Azure container", "cat the config.json from my bucket", "find
  *.csv under reports/", or any reference to cloud-fs / cloud-fs-mcp /
  @nogoo9/mcp-server-cloud-fs. Also trigger when the user wants to set up the
  cloud-fs VFS for the first time — the skill auto-detects credentials and
  only prompts the user when configuration is ambiguous.
---

# cloud-fs — POSIX-like VFS over cloud storage

This skill turns "cloud storage" into something the user can operate on
the way they think about local files: list a directory, grep a pattern,
edit a config, copy between paths. Two runtime modes:

- **MCP mode (preferred)** — uses the `mcp__cloud-fs__*` tools wired up via
  `.mcp.json`. Fastest path, structured tool results.
- **Bootstrap mode (fallback)** — when the MCP tools are not available, the
  skill walks the user through configuring cloud-fs as an MCP server, then
  drops back into MCP mode in the next session.

## Workflow

Follow these phases in order. Skip ahead only when a phase confirms the
state it checks for.

### Phase 1 — Detect runtime

Look at the available-tools list (system reminders earlier in this
conversation). If you see any tool prefixed `mcp__cloud-fs__`
(for example `mcp__cloud-fs__list_directory`,
`mcp__cloud-fs__list_allowed_directories`, `mcp__cloud-fs__read_text_file`),
you are in **MCP mode** — go to Phase 2.

If no `mcp__cloud-fs__*` tools are present:

1. Check whether the package is installed:
   ```bash
   command -v cloud-fs-mcp || npx --no -p @nogoo9/mcp-server-cloud-fs cloud-fs-mcp --help 2>&1 | head -1
   ```
2. You are in **bootstrap mode** — read `references/config.md` and follow
   the "Bootstrap a new project" flow. After the user adds cloud-fs to
   their `.mcp.json` and restarts Claude Code, MCP mode will be available.

### Phase 2 — Resolve the working root

Before any file operation, you need to know *which* root the user wants
to operate on. Roots look like `s3://bucket/prefix`, `az://container`,
`gs://bucket`, `mem://name`, or `sqlite://name`.

1. Call `mcp__cloud-fs__list_allowed_directories` to see what's configured.
2. If exactly one root is configured, use it. State the root once in your
   response so the user knows the scope ("Operating in `s3://my-data`").
3. If multiple roots are configured and the user's request doesn't name
   one, ask via `AskUserQuestion` which root to use. Don't guess.
4. If no roots are configured, you are effectively in bootstrap mode —
   go back to Phase 1's bootstrap path.

When the user gives a path, treat it as relative to a configured root
unless they used a full URI. Examples (with `s3://my-data` configured):
- `reports/q4.csv` → `s3://my-data/reports/q4.csv`
- `/` → `s3://my-data` (the root)
- `s3://other-bucket/foo` → use it as-is (only works if that root is
  also configured; otherwise the call will return "Access denied")

### Phase 3 — Translate the user's intent

The user thinks in shell commands. You execute MCP tool calls. The
mapping table is in `references/posix-mapping.md` — open it whenever
the request goes beyond `ls`/`cat`/`grep`. Quick reference:

| User says | MCP tool |
|---|---|
| `ls dir/` | `mcp__cloud-fs__list_directory` |
| `ls -l dir/` | `mcp__cloud-fs__list_directory_with_sizes` |
| `tree dir/` | `mcp__cloud-fs__directory_tree` |
| `cat file` | `mcp__cloud-fs__read_text_file` |
| `head -n N file` / `tail -n N file` | `mcp__cloud-fs__read_file_range` |
| `find dir -name '*.csv'` | `mcp__cloud-fs__search_files` |
| `grep pattern file` | `mcp__cloud-fs__grep_file` |
| `grep -r pattern dir` | `mcp__cloud-fs__grep_files` |
| `cp src dst` | `mcp__cloud-fs__copy_file` |
| `mv src dst` | `mcp__cloud-fs__move_file` |
| `mkdir dir/` | `mcp__cloud-fs__create_directory` |
| editing a file | `mcp__cloud-fs__edit_file` |
| writing a file | `mcp__cloud-fs__write_file` |
| `stat file` | `mcp__cloud-fs__get_file_info` |

Note: there is **no** `rm` — `mcp__cloud-fs__delete_file` is only present
when the server was started with `--enable-delete`. If the user wants to
delete and the tool isn't in the available list, tell them and point at
`references/config.md` for how to re-enable it.

### Phase 4 — Run the operation, then offer persistence (first session only)

After the first successful operation in a new project, check whether the
working root is already in the project's `.mcp.json`. If not, ask the
user (`AskUserQuestion`) whether to persist this provider configuration
so future Claude Code sessions in this project have it pre-wired. See
`references/config.md` → "Persisting to .mcp.json".

Do not ask if `.mcp.json` already has the cloud-fs entry — they've
already opted in.

## When to open the reference files

| Read this file | When |
|---|---|
| `references/config.md` | Bootstrapping a new project, persisting to `.mcp.json`, switching providers, or troubleshooting `Access denied` / "no roots" |
| `references/posix-mapping.md` | The user's request involves anything beyond `ls`/`cat`/`grep`, especially pipes, redirects, multi-file ops, or editing |
| `references/providers.md` | Setting credentials for a specific provider (AWS profiles, Azure connection strings, ADC, MinIO/RustFS endpoints), TLS / custom CA, or Redis cache options |

## Operating principles

- **Don't dump huge outputs.** When the user asks for a listing or a
  large file, summarize and offer to drill in. For files over a few
  hundred lines, prefer `read_file_range` over `read_text_file` and tell
  the user what slice you read.
- **One root per operation.** Cross-root copies are not supported as a
  single call; the user has to read then write. State this if they ask.
- **Trust path security.** The server enforces the root boundary —
  `..` traversal and wrong-bucket paths return
  `"Access denied: path is outside allowed roots"`. Surface that error
  back to the user verbatim if it appears; do not try to "fix" it by
  guessing.
- **Write-back cache.** Writes return immediately but flush
  asynchronously (default 2s debounce). If the user is about to kill
  the process or expects external readers to see the change, tell them
  this so they don't think a write was lost.
