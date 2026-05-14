# Audit Logging for Tool Invocations

> **Status:** ✅ Implemented in v0.6.0
> **Issue:** [#13](https://github.com/nogoo9/mcp-server-cloud-fs/issues/13)
> **Commit:** [`56a967d`](https://github.com/nogoo9/mcp-server-cloud-fs/commit/56a967d) — `feat(audit): add structured tool invocation audit logging`
> **Branch:** `feature/cloud-native-v1`

## Problem

Enterprise environments require visibility into **what the LLM did** with cloud storage access. Currently, there is no structured audit trail of which tools were called, what resources were accessed, or what data was modified. The existing `--request-logging` flag logs HTTP requests but not MCP tool-level semantics.

## Design

### Log Format

Structured JSON log entries emitted to stderr (following MCP convention):

```json
{
  "timestamp": "2024-01-15T10:02:44.123Z",
  "level": "info",
  "event": "tool_invocation",
  "tool": "write_file",
  "scope": "cloud-fs:write",
  "resource": "s3://my-bucket/data/config.json",
  "args": { "path": "s3://my-bucket/data/config.json" },
  "duration_ms": 142,
  "success": true,
  "bytes": 2048,
  "client_id": "session-abc123"
}
```

### Fields

| Field | Description |
|---|---|
| `timestamp` | ISO 8601 timestamp |
| `event` | Always `"tool_invocation"` |
| `tool` | Tool name (e.g., `read_file`, `write_file`, `shell`) |
| `scope` | OAuth scope required for this tool |
| `resource` | Full cloud URI of the accessed resource |
| `args` | Sanitized input arguments (omit large content bodies) |
| `duration_ms` | Execution time in milliseconds |
| `success` | Boolean — whether the tool returned without error |
| `error` | Error message if `success: false` |
| `bytes` | Bytes read/written (when applicable) |
| `client_id` | Session/client identifier (from auth token or transport) |

### Architecture

Implement as a **middleware wrapper** around tool handlers, not inline in each tool:

```
src/middleware/audit.ts  → [NEW] AuditLogger class + wrapToolHandler()
src/server.ts           → [MODIFY] wrap tool registrations with audit middleware
src/index.ts            → [MODIFY] add --audit-log CLI flag
```

### Middleware Pattern

```typescript
function wrapToolHandler(
  toolName: string,
  handler: ToolHandler,
  logger: AuditLogger,
): ToolHandler {
  return async (args, extra) => {
    const start = performance.now();
    try {
      const result = await handler(args, extra);
      logger.log({ tool: toolName, args, success: true, duration_ms: performance.now() - start });
      return result;
    } catch (err) {
      logger.log({ tool: toolName, args, success: false, error: err.message, ... });
      throw err;
    }
  };
}
```

### CLI Flag

```
--audit-log              Enable structured audit logging to stderr
--audit-log-file <path>  Write audit logs to a file instead of stderr
```

## Implementation Plan

1. Create `src/middleware/audit.ts` with `AuditLogger` class.
2. Implement `wrapToolHandler()` that intercepts tool calls.
3. Extract `resource` URI from tool args (`path`, `source`, `destination`).
4. Add `--audit-log` and `--audit-log-file` CLI flags to `src/index.ts`.
5. Integrate into `createMcpServer()` in `src/server.ts` — wrap each tool registration.
6. Sanitize args: strip large `content` fields, truncate long strings.
7. Unit tests: `src/middleware/audit.test.ts`.
8. Documentation: update CLI reference and production guide.

## Acceptance Criteria

- [x] `--audit-log` emits structured JSON to stderr for every tool call
- [x] `--audit-log-file` writes to a file instead
- [x] Logs include tool name, resource URI, duration, success/error
- [x] Large content bodies are NOT logged (sanitized)
- [x] Shell tool commands are logged with the command string
- [x] Audit logging has negligible performance overhead
- [x] Unit tests verify log format and sanitization
