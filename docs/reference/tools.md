# Tool Reference

All paths are cloud URIs — e.g. `s3://my-bucket/path/to/file.txt`. The server validates every path against the configured root URIs at startup; requests outside allowed roots are rejected.

## Read Tools

| Tool | Parameters | Description |
|---|---|---|
| `read_file` | `path` | Read a file. Binary → base64; text → UTF-8. |
| `read_text_file` | `path`, `head?`, `tail?` | Read text file with optional head/tail line limits. Returns ETag in metadata. |
| `read_media_file` | `path` | Read image/media as base64 MCP image content block. |
| `read_multiple_files` | `paths` | Read several files in parallel. |
| `read_file_range` ✨ | `path`, `offset`, `limit` | Read a 1-based line range with total line count header. |
| `read_file_chunk` ✨ | `path`, `start_byte`, `end_byte?`, `encoding?` | Read a byte range without downloading the entire file. Max 10MB. |

## Write Tools

| Tool | Parameters | Description |
|---|---|---|
| `write_file` | `path`, `content` | Write/overwrite a file. Flushed after debounce window. |
| `edit_file` | `path`, `edits[]`, `dryRun?`, `expected_etag?` | Apply `{ oldText, newText }` edits. Preview with `dryRun`. Optional ETag conflict detection. |

## Directory Tools

| Tool | Parameters | Description |
|---|---|---|
| `create_directory` | `path` | Create a directory placeholder and parent prefixes. |
| `list_directory` | `path` | List immediate children (like `ls`). |
| `list_directory_with_sizes` | `path`, `sortBy?`, `limit?` | List children with sizes. Sort by size or name. |
| `directory_tree` | `path`, `excludePatterns?` | Recursive directory tree with glob exclusions. |

## Move, Copy & Delete Tools

| Tool | Parameters | Description |
|---|---|---|
| `move_file` | `source`, `destination` | Move file. Server-side copy + delete for same-bucket. |
| `copy_file` ✨ | `source`, `destination` | Copy file. Server-side for same-bucket. |
| `delete_file` ✨ | `path` | Delete file. **Requires `--enable-delete`.** |

## Search Tools

| Tool | Parameters | Description |
|---|---|---|
| `search_files` | `path`, `pattern`, `excludePatterns?` | Glob-based object key search. |
| `grep_file` ✨ | `path`, `pattern`, `case_insensitive?` | Regex search in a single file with line numbers. |
| `grep_files` ✨ | `path`, `pattern`, `glob?`, `case_insensitive?`, `output_mode?`, `max_objects?` | Regex search across all objects under a path. |

## Info Tools

| Tool | Parameters | Description |
|---|---|---|
| `get_file_info` | `path` | File metadata: size, last-modified, content type. |
| `list_allowed_directories` | _(none)_ | List configured root URIs. |

> ✨ = Extended tool (not in standard mcp-server-filesystem)

## AI-Native Tools 🧠

| Tool | Parameters | Description |
|---|---|---|
| `get_file_schema` 🧠 | `path` | Extract structural schema: CSV column names/types/samples, JSON shape, or text line/byte counts. |
| `summarize_file` 🧠 | `path` | Compact head/tail preview with file size, line count, and content type. |

> 🧠 = AI-native tool (reduces LLM context token waste)

## Cloud-Native Tools ☁️

| Tool | Parameters | Description |
|---|---|---|
| `get_presigned_url` ☁️ | `path`, `operation?`, `expires_in?` | Generate a temporary access URL (default: GET, 1 hour). |
| `get_object_metadata` ☁️ | `path` | Get size, content type, last modified, custom metadata, and tags. |
| `set_object_tags` ☁️ | `path`, `tags` | Replace object tags with key-value pairs. |
| `search_by_tag` ☁️ | `path`, `tags`, `recursive?` | Find objects matching tag filters (AND logic). |
| `list_versions` ☁️ | `path`, `max_results?`, `page_token?` | List version history with timestamps, sizes, and markers. |
| `restore_version` ☁️ | `path`, `version_id` | Restore a previous object version (copies over current). |

> ☁️ = Cloud-native tool (requires provider support)

## Macro Tools 🩹

| Tool | Parameters | Description |
|---|---|---|
| `patch_file` 🩹 | `path`, `patch`, `format?`, `expected_etag?` | Apply unified diffs or line-range replacements atomically in a single tool call. |

Two patch formats are supported:

| Format | Syntax | Best for |
|--------|--------|----------|
| `unified` (default) | Standard `@@ -1,3 +1,3 @@` hunks | Multi-hunk diffs |
| `line_replace` | `startLine:endLine` followed by replacement text | Simple line-range replacements |

> 🩹 = Macro tool (combines multiple operations into one tool call)

## Shell Tool ⚡

| Tool | Parameters | Description |
|---|---|---|
| `shell` ⚡ | `command` | Execute POSIX-like commands. Supports pipes, redirects, and command list operators. **Requires `--enable-shell`.** |

**Built-in commands:** `ls`, `cat`, `head`, `tail`, `cp`, `mv`, `rm`, `mkdir`, `touch`, `stat`, `find`, `grep`, `wc`, `du`, `echo`, `tee`, `diff`, `jq`, `cd`

**Supported syntax:**

| Syntax | Description | Example |
|---|---|---|
| `cmd1 \| cmd2` | Pipe stdout of `cmd1` to stdin of `cmd2` | `cat s3://b/f \| grep foo \| wc -l` |
| `cmd > path` | Redirect stdout to file (overwrite) | `echo hello > s3://b/out.txt` |
| `cmd >> path` | Redirect stdout to file (append) | `date >> s3://b/logs.txt` |
| `< path cmd` | Redirect file content as stdin | `grep pat < s3://b/f.txt` |
| `cmd1 && cmd2` | Run `cmd2` only if `cmd1` succeeds | `mkdir s3://b/d && echo created` |
| `cmd1 \|\| cmd2` | Run `cmd2` only if `cmd1` fails | `cat missing \|\| echo fallback` |
| `cmd1 ; cmd2` | Always run both commands | `echo a ; echo b` |

```bash
shell "ls -l s3://my-bucket/data/"
shell "cat s3://my-bucket/config.json | grep port | wc -l"
shell "echo hello world > s3://my-bucket/greeting.txt"
shell "mkdir s3://my-bucket/reports && echo ready"
shell "cat s3://my-bucket/primary.json || cat s3://my-bucket/fallback.json"
```

::: warning
`shell` requires `--enable-shell`. `rm` and `mv` additionally require `--enable-delete`.
:::
