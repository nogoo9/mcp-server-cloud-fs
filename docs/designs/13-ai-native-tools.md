# AI-Native Schema & Summary Tools

> **Status:** ✅ Implemented in v0.7.0
> **Issue:** [#24](https://github.com/nogoo9/mcp-server-cloud-fs/issues/24)
> **Commit:** [`5cb7720`](https://github.com/nogoo9/mcp-server-cloud-fs/commit/5cb7720) — `feat(tools): AI-native get_file_schema and summarize_file tools`
> **Branch:** `feat/v0.7.0-improvements`

## Problem

LLMs routinely waste tokens reading entire files just to understand their structure. An agent working with a 10,000-row CSV will call `read_text_file`, consume the full file into context, then parse the header row itself — when all it needed was the column names and types. This is expensive and often hits context window limits.

## Design

### Goal

Add two server-side tools that extract structural metadata and compact previews, so LLMs can plan their approach before reading full files.

### `get_file_schema`

Returns structural metadata without the file contents:

| File Type | Output |
|-----------|--------|
| CSV/TSV | Column names, inferred types (`string`, `number`, `integer`, `boolean`, `date`), sample values from first 5 data rows, row count |
| JSON | Root type (`object`, `array`, `primitive`), top-level keys, element count for arrays, value type shapes |
| Other text | Line count, byte size, content type |

**CSV type inference** samples up to 5 rows per column and picks the dominant type:

```typescript
function inferCsvType(value: string): string {
  if (value === "true" || value === "false") return "boolean";
  if (/^-?\d+$/.test(value)) return "integer";
  if (/^-?\d+\.\d+$/.test(value)) return "number";
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return "date";
  return "string";
}
```

**CSV parsing** uses a custom quote-aware parser (handles escaped `""` within quoted fields) instead of splitting on commas.

### `summarize_file`

Returns a compact file overview:

```json
{
  "path": "s3://bucket/data.csv",
  "size": 524288,
  "lineCount": 10000,
  "extension": "csv",
  "contentType": "text/csv",
  "head": "id,name,value\n1,Alice,100\n...",
  "tail": "9998,Zara,42\n9999,Bob,99\n10000,Eve,0",
  "truncated": true
}
```

- `head`: First N lines (default 20, configurable via `max_lines`)
- `tail`: Last 5 lines (only shown when file exceeds `max_lines + 5`)
- `truncated`: Boolean indicating if file was truncated

### Architecture

```
src/tools/ai-native.ts → [NEW] handleGetFileSchema, handleSummarizeFile, registerAiNativeTools
src/server.ts          → [MODIFY] register ai-native tools
src/auth/scopes.ts     → [MODIFY] map tools to READ scope
```

## Implementation Plan

1. Implement CSV schema detection with quote-aware line parser.
2. Implement JSON schema detection (root type, keys, shapes).
3. Implement text fallback (line count + size).
4. Create `handleSummarizeFile` with configurable head/tail.
5. Register both tools in `createMcpServer()`.
6. Map tools to `cloud-fs:read` scope.
7. Unit tests: `src/tools/ai-native.test.ts` — 10 tests across all file types.

## Acceptance Criteria

- [x] `get_file_schema` returns column metadata for CSV files
- [x] `get_file_schema` returns shape information for JSON files
- [x] `get_file_schema` returns line/byte counts for generic text
- [x] CSV parser handles quoted fields with escaped quotes
- [x] `summarize_file` returns head/tail preview with metadata
- [x] `max_lines` parameter controls head size
- [x] Tail is omitted for short files
- [x] Both tools mapped to `cloud-fs:read` scope
- [x] 10 unit tests passing
