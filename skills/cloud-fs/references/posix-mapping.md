# POSIX shell ↔ cloud-fs MCP tool mapping

Translate the user's shell-mental-model into MCP tool calls. The user
should not need to know the tool names — they think in commands, you
think in tools.

All `mcp__cloud-fs__*` tools accept absolute paths within an allowed
root (e.g. `s3://my-bucket/foo/bar`) and most also accept paths
relative to the root once you've established context.

---

## Listing & navigation

| User says | Tool | Notes |
|---|---|---|
| `ls`, `ls dir/` | `list_directory` | Returns entries in one directory; no recursion |
| `ls -l`, `ls -lh` | `list_directory_with_sizes` | Adds byte counts and types |
| `tree`, `tree dir/` | `directory_tree` | Recursive — use a depth limit or narrow path for big buckets |
| `find dir -name 'pat'` | `search_files` | Glob-style name match, recursive from `dir` |
| `pwd` / "what am I looking at" | `list_allowed_directories` | The configured roots are your "home" |

Big-listing rule: if `list_directory` returns more than ~50 entries,
summarize ("142 files, mostly `.parquet` under `data/2024-`") and ask
what to drill into. Never dump 500 lines of filenames.

---

## Reading

| User says | Tool | Notes |
|---|---|---|
| `cat file` | `read_text_file` | Text files only |
| `head -n N file` | `read_file_range` | `start: 0, end: N` |
| `tail -n N file` | `read_file_range` | First get size via `get_file_info`, then range from `size - N*avg_line` (or read the whole file if small) |
| `cat file1 file2 file3` | `read_multiple_files` | One call, batched |
| viewing an image / binary | `read_media_file` | Returns base64; use sparingly |
| reading a slice | `read_file_range` | `start` / `end` are byte offsets |

For files over a few thousand lines, prefer `read_file_range` and tell
the user what slice you read. Don't ingest 50 MB log files into your
context.

---

## Searching

| User says | Tool | Notes |
|---|---|---|
| `grep pattern file` | `grep_file` | Single file, returns matching lines with line numbers |
| `grep -r pattern dir/` | `grep_files` | Recursive — capped at `--grep-max-objects` per call (default 1000) |
| `grep -i`, `-w`, `-v` etc. | `grep_file` / `grep_files` | Pattern is regex; use `(?i)` for case-insensitive |
| `find -name X | xargs grep Y` | `grep_files` with a path filter | One call |
| counting lines / `wc -l` of grep output | `grep_files` then count returned matches | No separate `wc` |

If the user grep'd something and there are too many matches to summarize
in one response, paginate by narrowing the path or pattern, not by
re-running the same call.

---

## Writing & editing

| User says | Tool | Notes |
|---|---|---|
| `echo X > file` / writing a new file | `write_file` | Full content overwrite |
| `echo X >> file` / appending | `read_text_file` + `write_file` | No native append — read, concatenate, write |
| editing a config / fixing a typo / changing a line | `edit_file` | Diff-based; supports `dryRun` to preview |
| `mkdir dir/` / `mkdir -p` | `create_directory` | Creates a marker; idempotent |
| `cp src dst` | `copy_file` | Same root; cross-root copy = read + write |
| `mv src dst` / rename | `move_file` | Same root |
| `rm file` | `delete_file` (when enabled) | Only available if server started with `--enable-delete`. If absent, tell the user and link to `config.md` |

`edit_file` is the right tool whenever the user wants a small targeted
change — it preserves the rest of the file and shows a diff. Reach for
`write_file` only when replacing the whole file.

---

## Metadata

| User says | Tool | Notes |
|---|---|---|
| `stat file`, `file file`, "when was this modified" | `get_file_info` | Size, mtime, content type |
| "is this a file or directory" | `get_file_info` | Returns the type |
| "how big is this bucket / prefix" | iterate `list_directory_with_sizes` | No bulk sum; sum client-side, and warn if it'll be slow |

---

## Pipes & redirects

The MCP tools don't have a literal pipe, but most pipe patterns
collapse into a single call:

| Pipe | What to do |
|---|---|
| `cat file | grep pat` | `grep_file` directly |
| `find dir -name '*.csv' | head -5` | `search_files`, take first 5 from the result |
| `grep -r pat dir | wc -l` | `grep_files`, then count |
| `cat f1 f2 > out` | `read_multiple_files`, concatenate in memory, `write_file` |
| `ls dir | grep pat` | `list_directory` then filter the result in your response |

If a pipeline is genuinely complex (multi-stage transforms,
non-trivial awk/sed), tell the user: "this is easier in the cloud-fs
interactive shell — run `npx -p @nogoo9/mcp-server-cloud-fs cloud-fs
<provider> <root>` and pipe natively." The MCP API is read/write
primitives, not a stream-processing layer.

---

## Paths & roots

- Paths are URIs (`s3://bucket/key`, `az://container/key`,
  `gs://bucket/key`, `mem://name/key`, `sqlite://name/key`).
- Most tools accept root-relative paths once a root is known. Prefer
  absolute URIs when the user is ambiguous.
- `..` traversal and wrong-bucket paths return `"Access denied: path is
  outside allowed roots"` — surface that verbatim and don't try to
  rewrite the path.

---

## Display tips

When showing tool output back to the user, pick a format that matches
the shell intuition they invoked:

- `ls` → bare filenames, one per line, alphabetical
- `ls -l` → name, size, mtime (3 columns)
- `grep` → `path:line:match` format, like real grep
- `find` → bare paths, one per line
- `cat` → just the content, in a code block if it's code/config
- `stat` → key: value lines, not a table

This makes outputs feel like the shell the user is thinking in.
