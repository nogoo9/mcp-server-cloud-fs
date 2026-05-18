# What's New in v0.7.0

Welcome to the **v0.7.0** release of `mcp-server-cloud-fs`! This release evolves the server into an **AI-native cloud interface** — giving LLM agents smarter tools, stronger safety guarantees, and fewer wasted API calls.

Here are the major highlights.

---

## 🎯 Dynamic Tool Surface Reduction

When OAuth scopes are granted to a session, the server now **filters the tool list** so clients only see tools they're authorized to use.

A read-only client (`cloud-fs:read`) will never see `write_file`, `delete_file`, or `shell` in `tools/list`. This:
- Reduces prompt token overhead (fewer tool descriptions)
- Prevents tool hallucination (the LLM can't call what it can't see)
- Enforces least-privilege access at the MCP layer

Backwards-compatible: if no `grantedScopes` are passed, all tools remain available.

[Read more about OAuth Scopes](/guide/authentication)

## 🛡️ DLP Content Sanitization

A new **Data Loss Prevention (DLP) middleware** redacts sensitive content from tool responses *before* they reach the MCP client. Ships with 9 default patterns:

| Pattern | Example |
|---------|---------|
| AWS Access Key | `AKIAIOSFODNN7EXAMPLE` → `[REDACTED:AWS_KEY]` |
| Email Address | `alice@example.com` → `[REDACTED:EMAIL]` |
| US SSN | `123-45-6789` → `[REDACTED:SSN]` |
| Credit Card | `4111 1111 1111 1111` → `[REDACTED:CC]` |
| JWT Token | `eyJhbG...` → `[REDACTED:JWT]` |
| API Key | `sk-abc123...`, `sk_live_...` → `[REDACTED:API_KEY]` |

Enable via the `--enable-dlp` CLI flag. Custom patterns can be added programmatically.

[Read more about DLP](/guide/production#dlp-content-sanitization)

## 🧠 AI-Native Tools

Two new tools that let LLMs understand file structure **without downloading entire files**:

### `get_file_schema`

Extracts structural metadata server-side:
- **CSV**: Column names, inferred types (string/number/boolean), sample values, row count
- **JSON**: Root type, keys, nested shapes
- **Text**: Line count, byte size

### `summarize_file`

Returns a compact overview of any file:
- First and last 5 lines (head/tail preview)
- File size and line count
- Content type

These tools eliminate the common LLM anti-pattern of reading a 10,000-line CSV just to learn its column names.

[View the Tool Reference](/reference/tools#ai-native-tools-)

## 🔒 Optimistic Concurrency (ETags)

Every file write now computes a **SHA-256 content hash (ETag)** that's persisted in the VFS inode overlay.

- `read_text_file` includes the ETag in response metadata: `[etag: abc123...]`
- `edit_file` accepts an optional `expected_etag` parameter
  - **Match** → edit proceeds normally
  - **Mismatch** → returns a conflict error with the current ETag
  - **Omitted** → backwards-compatible, no check

This enables multi-agent workflows where agents can detect and resolve conflicts instead of silently overwriting each other's work.

[Read more about ETags](/architecture/vfs#etags)

## 🩹 `patch_file` Macro Tool

A new high-level tool that **combines read + transform + write into a single tool call**, reducing the typical 3-step workflow to 1.

Supports two patch formats:

| Format | Syntax | Best for |
|--------|--------|----------|
| `unified` (default) | Standard `@@ -1,3 +1,3 @@` hunks | Multi-hunk diffs, familiar to LLMs |
| `line_replace` | `startLine:endLine` followed by replacement text | Simple line-range replacements |

Both formats support optional `expected_etag` for concurrency safety.

```
# Example: unified diff
patch_file path=s3://bucket/config.json patch="@@ -2,1 +2,1 @@
-  \"port\": 3000
+  \"port\": 8080"
```

[View the Tool Reference](/reference/tools#macro-tools-)

---

*For a full list of commits and changes, check out the [Changelog](/development/changelog).*
